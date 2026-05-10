import { ESLint, type Linter } from "eslint";
import { readFileSync } from "node:fs";
import svelteParser from "svelte-eslint-parser";
import tsParser from "@typescript-eslint/parser";
import svelteDoctorPlugin from "./eslint-plugin.js";
import {
  ERROR_RULE_PENALTY,
  RULE_PREFIX,
  WARNING_RULE_PENALTY,
  labelForScore,
} from "./constants.js";
import { allRuleMeta } from "./plugin/rule-meta.js";
import {
  detectProject,
  preflightSvelteProject,
} from "./utils/framework-detection.js";
import { SvelteDoctorError } from "./utils/error-handling.js";
import { loadConfig, resolveConfig } from "./utils/config-loader.js";
import { applySuppressionsAndDetectUnused } from "./utils/suppression.js";
import {
  getChangedFiles,
  type GitDiffOptions,
} from "./utils/git-diff.js";
import { runKnip } from "./utils/knip-runner.js";
import { runNpmAudit } from "./utils/audit-runner.js";
import { createIgnorePipeline } from "./utils/ignore-pipeline.js";
import { dedupeDiagnostics, sortDiagnostics } from "./utils/sort-diagnostics.js";
import {
  findUserEslintConfig,
  loadUserEslintConfig,
} from "./utils/user-eslint-config.js";
import { selectProjects } from "./utils/workspace.js";
import type {
  Category,
  Diagnostic,
  DiagnoseResult,
  ProjectInfo,
  Score,
  Severity,
  SvelteDoctorConfig,
} from "./types.js";

export type ScanStage =
  | "detecting"
  | "loading-config"
  | "linting"
  | "dead-code"
  | "audit"
  | "post-processing";

export interface ScanOptions {
  lint?: boolean;
  deadCode?: boolean;
  /** Run `npm audit` / `pnpm audit` and surface vulnerable dependencies as security diagnostics. */
  audit?: boolean;
  diff?: GitDiffOptions;
  configOverrides?: Partial<SvelteDoctorConfig>;
  /** Workspace sub-project name(s), comma-separated. Resolved against project root. */
  project?: string;
  /** Override detected svelte major. Used by --svelte-version CLI flag. */
  svelteMajorOverride?: 4 | 5;
  /** Optional callback invoked when scan moves between stages (for spinner UX). */
  onStage?: (stage: ScanStage) => void;
}

const SVELTE_LINT_TARGETS = [
  "**/*.svelte",
  "**/*.svelte.ts",
  "**/*.svelte.js",
];

const SVELTEKIT_TS_TARGETS = [
  "src/routes/**/*.{ts,js,mts,cts,mjs,cjs}",
  "src/hooks*.{ts,js}",
  "src/hooks/**/*.{ts,js}",
  "svelte.config.{js,ts,mjs,cjs}",
];

function severityFromEslint(level: 0 | 1 | 2): Severity {
  if (level === 2) return "error";
  if (level === 1) return "warning";
  return "info";
}

function categoryFor(ruleId: string): Category {
  const bare = ruleId.replace(`${RULE_PREFIX}/`, "");
  return allRuleMeta().find((m) => m.id === bare)?.category ?? "architecture";
}

function pickPreset(project: ProjectInfo): Linter.Config {
  if (project.svelteMajor === 4) {
    return project.framework === "sveltekit"
      ? svelteDoctorPlugin.configs["svelte4-sveltekit"]
      : svelteDoctorPlugin.configs.svelte4;
  }
  return project.framework === "sveltekit"
    ? svelteDoctorPlugin.configs.sveltekit
    : svelteDoctorPlugin.configs.recommended;
}

function buildEslint(
  project: ProjectInfo,
  ignoreRules: string[],
  ignoreFiles: string[],
  userConfigs: Linter.Config[],
  customRulesOnly: boolean,
): ESLint {
  const overrideRules: Linter.RulesRecord = Object.fromEntries(
    ignoreRules.map((id) => [id, "off" as const]),
  );
  const overrides: Linter.Config | null = ignoreRules.length
    ? { rules: overrideRules }
    : null;

  const presetConfigs = customRulesOnly ? [] : [pickPreset(project)];

  return new ESLint({
    cwd: project.root,
    errorOnUnmatchedPattern: false,
    overrideConfigFile: true,
    ignorePatterns: ignoreFiles.length ? ignoreFiles : undefined,
    overrideConfig: [
      {
        files: ["**/*.{js,ts,mjs,cjs}"],
        languageOptions: {
          parser: tsParser,
          ecmaVersion: 2022,
          sourceType: "module",
        },
      },
      {
        files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        languageOptions: {
          parser: svelteParser,
          parserOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: "module",
          },
        },
      },
      ...presetConfigs,
      ...userConfigs,
      ...(overrides ? [overrides] : []),
    ],
  });
}

function defaultTargetsFor(project: ProjectInfo): string[] {
  const targets = [...SVELTE_LINT_TARGETS];
  if (project.framework === "sveltekit") targets.push(...SVELTEKIT_TS_TARGETS);
  return targets;
}

async function runLint(
  project: ProjectInfo,
  ignoreRules: string[],
  ignoreFiles: string[],
  diffFiles: string[] | null,
  userConfigs: Linter.Config[],
  customRulesOnly: boolean,
): Promise<{
  diagnostics: Diagnostic[];
  sources: Map<string, string>;
  lintedFilePaths: Set<string>;
}> {
  const eslint = buildEslint(
    project,
    ignoreRules,
    ignoreFiles,
    userConfigs,
    customRulesOnly,
  );
  const targets =
    diffFiles && diffFiles.length ? diffFiles : defaultTargetsFor(project);
  if (!targets.length) {
    return {
      diagnostics: [],
      sources: new Map(),
      lintedFilePaths: new Set(),
    };
  }
  const results = await eslint.lintFiles(targets);
  const diagnostics: Diagnostic[] = [];
  const sources = new Map<string, string>();
  const lintedFilePaths = new Set<string>();
  for (const result of results) {
    lintedFilePaths.add(result.filePath);
    if (result.source) sources.set(result.filePath, result.source);
    for (const message of result.messages) {
      const ruleId = message.ruleId ?? "syntax/parser-error";
      diagnostics.push({
        ruleId,
        category: categoryForExternal(ruleId),
        severity: severityFromEslint(message.severity),
        message: message.message,
        file: result.filePath,
        line: message.line,
        column: message.column,
        endLine: message.endLine,
        endColumn: message.endColumn,
      });
    }
  }
  return { diagnostics, sources, lintedFilePaths };
}

function categoryForExternal(ruleId: string): Category {
  if (ruleId.startsWith(`${RULE_PREFIX}/`)) return categoryFor(ruleId);
  if (ruleId.startsWith("syntax/") || ruleId === "syntax/parser-error") {
    return "architecture";
  }
  if (ruleId.includes("a11y") || ruleId.startsWith("svelte/a11y-")) {
    return "accessibility";
  }
  if (ruleId.startsWith("security/")) return "security";
  if (ruleId.startsWith("performance/") || ruleId.includes("perf")) {
    return "performance";
  }
  return "architecture";
}

function loadSourcesForFiles(
  files: string[],
  existing: Map<string, string>,
): Map<string, string> {
  const out = new Map(existing);
  for (const file of files) {
    if (out.has(file)) continue;
    try {
      out.set(file, readFileSync(file, "utf8"));
    } catch {
      // ignore
    }
  }
  return out;
}

export function computeScore(diagnostics: Diagnostic[]): Score {
  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  for (const d of diagnostics) {
    if (d.severity === "error") errorRules.add(d.ruleId);
    else if (d.severity === "warning") warningRules.add(d.ruleId);
  }
  const penalty =
    errorRules.size * ERROR_RULE_PENALTY +
    warningRules.size * WARNING_RULE_PENALTY;
  const score = Math.max(0, Math.round(100 - penalty));
  return { score, label: labelForScore(score) };
}

async function loadUserConfigsIfRequested(
  rootDir: string,
  config: ReturnType<typeof resolveConfig>,
): Promise<Linter.Config[]> {
  // customRulesOnly implies user wants their own rules — always adopt the
  // user's eslint config in that mode, regardless of adoptExistingLintConfig.
  if (!config.adoptExistingLintConfig && !config.customRulesOnly) return [];
  const configPath = findUserEslintConfig(rootDir);
  if (!configPath) return [];
  const userConfigs = await loadUserEslintConfig(configPath);
  return userConfigs ?? [];
}

async function scanSingleProject(
  project: ProjectInfo,
  options: ScanOptions,
): Promise<DiagnoseResult> {
  const onStage = options.onStage ?? (() => {});

  onStage("loading-config");
  const rawConfig = loadConfig(project.root);
  const config = resolveConfig(rawConfig, options.configOverrides);

  const cliLint = options.lint;
  const cliDeadCode = options.deadCode;
  const lintEnabled = cliLint === undefined ? config.lint : cliLint;
  const deadCodeEnabled =
    cliDeadCode === undefined ? config.deadCode : cliDeadCode;

  const diffFiles = options.diff
    ? getChangedFiles(project.root, options.diff)
    : null;

  const mode: DiagnoseResult["mode"] = options.diff?.staged
    ? "staged"
    : options.diff
      ? "diff"
      : "full";

  const diffInfo: DiagnoseResult["diffInfo"] | undefined = options.diff?.staged
    ? { staged: true }
    : options.diff
      ? { base: options.diff.base }
      : undefined;

  const ignoreRules = (config.ignore.rules ?? []).map((r) =>
    r.startsWith(`${RULE_PREFIX}/`) ? r : `${RULE_PREFIX}/${r}`,
  );

  const userConfigs = await loadUserConfigsIfRequested(project.root, config);

  const diagnostics: Diagnostic[] = [];
  let sources = new Map<string, string>();
  let lintedFilePaths = new Set<string>();

  if (lintEnabled) {
    onStage("linting");
    const lintResult = await runLint(
      project,
      ignoreRules,
      config.ignore.files ?? [],
      diffFiles,
      userConfigs,
      config.customRulesOnly,
    );
    diagnostics.push(...lintResult.diagnostics);
    sources = lintResult.sources;
    lintedFilePaths = lintResult.lintedFilePaths;
  }

  if (deadCodeEnabled && !diffFiles) {
    onStage("dead-code");
    const knipDiagnostics = await runKnip(project.root);
    diagnostics.push(...knipDiagnostics);
  }

  const auditEnabled =
    options.audit === undefined ? config.audit : options.audit;
  if (auditEnabled && !diffFiles) {
    onStage("audit");
    try {
      const auditDiagnostics = await runNpmAudit({
        cwd: project.root,
        packageManager: project.packageManager,
        skipIfNoManifest: true,
      });
      diagnostics.push(...auditDiagnostics);
    } catch {
      // audit is best-effort; never let it crash the scan
    }
  }

  onStage("post-processing");

  const ignorePipeline = createIgnorePipeline({
    projectRoot: project.root,
    ignoreFiles: config.ignore.files ?? [],
    ignoreOverrides: config.ignore.overrides ?? [],
  });

  let resultDiagnostics = diagnostics.filter((d) => ignorePipeline.filter(d));

  if (config.respectInlineDisables) {
    const allFilesToScan = [
      ...new Set([
        ...resultDiagnostics.map((d) => d.file),
        ...lintedFilePaths,
      ]),
    ].filter((path) => !ignorePipeline.isPathIgnored(path));
    const completeSources = loadSourcesForFiles(allFilesToScan, sources);
    const { diagnostics: filtered, unusedDisables } =
      applySuppressionsAndDetectUnused(resultDiagnostics, completeSources);
    const filteredUnused = unusedDisables.filter((d) =>
      ignorePipeline.filter(d),
    );
    resultDiagnostics = [...filtered, ...filteredUnused];
  }

  const finalDiagnostics = sortDiagnostics(dedupeDiagnostics(resultDiagnostics));

  return {
    project,
    diagnostics: finalDiagnostics,
    score: computeScore(finalDiagnostics),
    mode,
    diffInfo,
  };
}

export async function scan(
  rootInput: string,
  options: ScanOptions = {},
): Promise<DiagnoseResult> {
  const onStage = options.onStage ?? (() => {});
  onStage("detecting");
  const rootProject = detectProject(rootInput, {
    svelteMajorOverride: options.svelteMajorOverride,
  });
  const workspaceProjects = await selectProjects(
    rootProject.root,
    options.project,
  );

  if (!workspaceProjects.length) {
    const preflight = preflightSvelteProject(rootProject);
    if (!preflight.ok) {
      throw new SvelteDoctorError(preflight.reason ?? "Preflight failed", {
        hint: preflight.hint,
      });
    }
    return scanSingleProject(rootProject, options);
  }

  const aggregated: Diagnostic[] = [];
  let mode: DiagnoseResult["mode"] = "full";
  let diffInfo: DiagnoseResult["diffInfo"] | undefined;
  for (const ws of workspaceProjects) {
    const subProject = detectProject(ws.root, {
      svelteMajorOverride: options.svelteMajorOverride,
    });
    const sub = await scanSingleProject(subProject, options);
    aggregated.push(...sub.diagnostics);
    mode = sub.mode;
    diffInfo = sub.diffInfo;
  }
  const final = sortDiagnostics(dedupeDiagnostics(aggregated));
  return {
    project: rootProject,
    diagnostics: final,
    score: computeScore(final),
    mode,
    diffInfo,
  };
}

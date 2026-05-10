import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import { resolve, relative } from "node:path";
import { encodeAnnotation } from "./utils/annotation-encoding.js";
import { allRuleIds, RECOMMENDED_RULE_IDS } from "./eslint-plugin.js";
import { renderAmbulance, renderDoctorBanner } from "./utils/banner.js";
import {
  buildJsonErrorReport,
  extractMissingPluginHint,
  formatErrorChain,
  SvelteDoctorError,
} from "./utils/error-handling.js";
import { renderSignature } from "./utils/signature.js";
import {
  CATEGORY_LABEL,
  NON_VERBOSE_FILES_PER_RULE,
  NON_VERBOSE_RULES_PER_CATEGORY,
  SCORE_BAR_WIDTH,
  SUPPRESSION_DIRECTIVE,
  SUPPRESSION_NEAR_MISS_MAX_LINES,
  VERSION,
} from "./constants.js";
import { scan } from "./scan.js";
import { toJsonReport } from "./index.js";
import { getRuleMeta } from "./plugin/rule-meta.js";
import type {
  Category,
  Diagnostic,
  DiagnoseResult,
  Score,
  ScoreLabel,
} from "./types.js";

interface CliOptions {
  lint: boolean;
  deadCode: boolean;
  verbose: boolean;
  score: boolean;
  json: boolean;
  jsonCompact: boolean;
  yes: boolean;
  full: boolean;
  diff?: string | boolean;
  staged: boolean;
  offline: boolean;
  failOn: "error" | "warning" | "none";
  annotations: boolean;
  explain?: string;
  why?: string;
  project?: string;
  watch: boolean;
  respectInlineDisables: boolean;
  scope?: "recommended" | "all" | "custom";
  svelteVersion?: string;
}

function paintLabel(label: ScoreLabel): string {
  if (label === "Great") return pc.green(label);
  if (label === "Needs work") return pc.yellow(label);
  return pc.red(label);
}

function paintSeverity(severity: Diagnostic["severity"]): string {
  if (severity === "error") return pc.red("error");
  if (severity === "warning") return pc.yellow("warn");
  return pc.gray("info");
}

function colorByScore(score: number, text: string): string {
  if (score >= 75) return pc.green(text);
  if (score >= 50) return pc.yellow(text);
  return pc.red(text);
}

function renderScoreBar(score: Score): string {
  const filled = Math.round((score.score / 100) * SCORE_BAR_WIDTH);
  const empty = SCORE_BAR_WIDTH - filled;
  const bar = "█".repeat(filled) + pc.dim("░".repeat(empty));
  return `${colorByScore(score.score, bar)} ${pc.bold(String(score.score))}/100  ${paintLabel(score.label)}`;
}

function suppressionHint(d: Diagnostic): string {
  return `// ${SUPPRESSION_DIRECTIVE} ${d.ruleId}`;
}

interface RuleGroup {
  ruleId: string;
  category: Category;
  diagnostics: Diagnostic[];
}

function groupByCategoryAndRule(
  diagnostics: Diagnostic[],
): Map<Category, RuleGroup[]> {
  const byCat = new Map<Category, Map<string, RuleGroup>>();
  for (const d of diagnostics) {
    const cat = byCat.get(d.category) ?? new Map<string, RuleGroup>();
    const grp = cat.get(d.ruleId) ?? {
      ruleId: d.ruleId,
      category: d.category,
      diagnostics: [],
    };
    grp.diagnostics.push(d);
    cat.set(d.ruleId, grp);
    byCat.set(d.category, cat);
  }
  const result = new Map<Category, RuleGroup[]>();
  for (const [category, ruleMap] of byCat) {
    const groups = [...ruleMap.values()].sort(
      (a, b) => b.diagnostics.length - a.diagnostics.length,
    );
    result.set(category, groups);
  }
  return result;
}

function severityRank(s: Diagnostic["severity"]): number {
  if (s === "error") return 0;
  if (s === "warning") return 1;
  return 2;
}

function categoryWorstSeverity(groups: RuleGroup[]): Diagnostic["severity"] {
  let worst: Diagnostic["severity"] = "info";
  for (const g of groups) {
    for (const d of g.diagnostics) {
      if (severityRank(d.severity) < severityRank(worst)) worst = d.severity;
    }
  }
  return worst;
}

function renderHuman(result: DiagnoseResult, verbose: boolean): string {
  const lines: string[] = [];
  const { project, score, diagnostics } = result;

  lines.push(renderSignature());
  lines.push("");
  lines.push(renderDoctorBanner(project, score));
  lines.push("");

  if (!diagnostics.length) {
    if (score && score.score === 100) {
      lines.push(pc.green("Perfect health. No issues found. ✚"));
    } else {
      lines.push(pc.green("No issues found."));
    }
    return lines.join("\n");
  }

  if (score && score.score < 50) {
    lines.push(renderAmbulance());
    lines.push("");
  }

  const grouped = groupByCategoryAndRule(diagnostics);
  let hiddenRules = 0;
  let hiddenFiles = 0;

  for (const [category, ruleGroups] of grouped) {
    const worst = categoryWorstSeverity(ruleGroups);
    const total = ruleGroups.reduce((n, g) => n + g.diagnostics.length, 0);
    lines.push(
      `${paintSeverity(worst)} ${pc.bold(CATEGORY_LABEL[category])} ${pc.dim(`(${total})`)}`,
    );

    const visibleRules = verbose
      ? ruleGroups
      : ruleGroups.slice(0, NON_VERBOSE_RULES_PER_CATEGORY);
    if (!verbose) hiddenRules += ruleGroups.length - visibleRules.length;

    for (const group of visibleRules) {
      const meta = getRuleMeta(group.ruleId);
      const sample = group.diagnostics[0];
      lines.push(
        `  ${paintSeverity(sample.severity)} ${pc.bold(group.ruleId)} ${pc.dim(`× ${group.diagnostics.length}`)}`,
      );
      lines.push(`    ${sample.message}`);
      if (meta?.docsUrl) {
        lines.push(`    ${pc.dim(meta.docsUrl)}`);
      }

      const fileSites = new Map<string, number[]>();
      for (const d of group.diagnostics) {
        const sites = fileSites.get(d.file) ?? [];
        sites.push(d.line);
        fileSites.set(d.file, sites);
      }
      const fileEntries = [...fileSites.entries()];
      const visibleFiles = verbose
        ? fileEntries
        : fileEntries.slice(0, NON_VERBOSE_FILES_PER_RULE);
      if (!verbose) hiddenFiles += fileEntries.length - visibleFiles.length;

      for (const [file, sites] of visibleFiles) {
        const rel = relative(project.root, file);
        const linesText = sites.slice(0, 3).join(", ");
        const moreSites = sites.length > 3 ? ` +${sites.length - 3} more` : "";
        lines.push(`      ${pc.cyan(rel)} ${pc.dim(`:${linesText}${moreSites}`)}`);
      }
      if (!verbose && fileEntries.length > NON_VERBOSE_FILES_PER_RULE) {
        lines.push(
          `      ${pc.dim(`+${fileEntries.length - NON_VERBOSE_FILES_PER_RULE} more files`)}`,
        );
      }
      lines.push(`    ${pc.dim("suppress with:")} ${pc.dim(suppressionHint(sample))}`);
      const nearMiss = group.diagnostics.find((d) => d.suppressionHint);
      if (nearMiss?.suppressionHint) {
        lines.push(`    ${pc.yellow("hint:")} ${nearMiss.suppressionHint}`);
      }
    }
    if (!verbose && ruleGroups.length > NON_VERBOSE_RULES_PER_CATEGORY) {
      lines.push(
        `  ${pc.dim(`+${ruleGroups.length - NON_VERBOSE_RULES_PER_CATEGORY} more rules`)}`,
      );
    }
    lines.push("");
  }

  const fileSet = new Set(diagnostics.map((d) => d.file));
  lines.push(
    pc.dim(
      `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"} across ${fileSet.size} file${fileSet.size === 1 ? "" : "s"}.`,
    ),
  );
  if (!verbose && (hiddenRules > 0 || hiddenFiles > 0)) {
    lines.push(
      pc.dim(
        `${hiddenRules} rule${hiddenRules === 1 ? "" : "s"} and ${hiddenFiles} file mention${hiddenFiles === 1 ? "" : "s"} hidden — run with --verbose to see all.`,
      ),
    );
  }
  return lines.join("\n");
}

function renderAnnotations(result: DiagnoseResult): string {
  return result.diagnostics.map(encodeAnnotation).join("\n");
}

function parseExplainTarget(input: string): { file: string; line: number } | null {
  const lastColon = input.lastIndexOf(":");
  if (lastColon < 1) return null;
  const file = input.slice(0, lastColon);
  const line = Number.parseInt(input.slice(lastColon + 1), 10);
  if (!file || !Number.isFinite(line)) return null;
  return { file, line };
}

function explainDiagnostic(result: DiagnoseResult, target: string): string {
  const parsed = parseExplainTarget(target);
  if (!parsed) {
    return pc.red(`Invalid --explain target: "${target}". Use file:line.`);
  }
  const absoluteTarget = resolve(result.project.root, parsed.file);
  const matches = result.diagnostics.filter(
    (d) => d.file === absoluteTarget && d.line === parsed.line,
  );
  const lines: string[] = [];
  lines.push(
    `${pc.bold("Explain")} ${pc.dim(relative(result.project.root, absoluteTarget))}:${parsed.line}`,
  );
  if (!matches.length) {
    lines.push("");
    lines.push("No diagnostics fired at that location.");
    lines.push(
      "If you expected a rule to fire, check that the file is included in the lint scope and the rule is enabled.",
    );
    return lines.join("\n");
  }
  for (const d of matches) {
    const meta = getRuleMeta(d.ruleId);
    lines.push("");
    lines.push(
      `${paintSeverity(d.severity)} ${pc.bold(d.ruleId)} (${d.category})`,
    );
    lines.push(`  ${d.message}`);
    if (meta) {
      lines.push(`  ${pc.dim(meta.description)}`);
      lines.push(`  ${pc.dim("docs:")} ${meta.docsUrl}`);
    }
    lines.push(`  ${pc.dim("suppress:")} ${suppressionHint(d)}`);
    if (d.suppressionHint) {
      lines.push(`  ${pc.yellow("hint:")} ${d.suppressionHint}`);
    } else {
      lines.push(
        `  ${pc.dim("nearby suppressions:")} none found within ${SUPPRESSION_NEAR_MISS_MAX_LINES} lines`,
      );
    }
  }
  return lines.join("\n");
}

function shouldExitFailing(
  diagnostics: Diagnostic[],
  failOn: CliOptions["failOn"],
): boolean {
  if (failOn === "none") return false;
  if (failOn === "error") {
    return diagnostics.some((d) => d.severity === "error");
  }
  return diagnostics.some(
    (d) => d.severity === "error" || d.severity === "warning",
  );
}

const STAGE_LABELS: Record<string, string> = {
  detecting: "Detecting project…",
  "loading-config": "Loading configuration…",
  linting: "Linting…",
  "dead-code": "Detecting dead code…",
  "post-processing": "Computing score…",
};

function isMachineMode(opts: CliOptions): boolean {
  return Boolean(
    opts.json ||
      opts.score ||
      opts.annotations ||
      opts.explain ||
      opts.why ||
      opts.watch,
  );
}

const CI_ENV_VARS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "BUILDKITE",
  "JENKINS_URL",
  "TF_BUILD",
  "CIRCLECI",
  "TRAVIS",
  "DRONE",
  "CLAUDECODE",
  "CLAUDE_CODE",
  "CURSOR_AGENT",
  "OPENCODE",
];

function isNonInteractive(opts: CliOptions): boolean {
  if (opts.yes || opts.full) return true;
  if (opts.project) return true;
  if (isMachineMode(opts)) return true;
  if (!process.stdin.isTTY) return true;
  return CI_ENV_VARS.some((v) => Boolean(process.env[v]));
}

async function pickWorkspaceProjects(
  directory: string,
  opts: CliOptions,
): Promise<string | undefined> {
  if (opts.project) return opts.project;
  if (isNonInteractive(opts)) return undefined;

  const { discoverWorkspaceProjects } = await import("./utils/workspace.js");
  const projects = await discoverWorkspaceProjects(resolve(directory));
  if (projects.length <= 1) return undefined;

  const { promptWorkspaceProjects } = await import("./utils/prompt-workspace.js");
  const result = await promptWorkspaceProjects(resolve(directory));
  if (!result) {
    process.stderr.write(`${pc.dim("Cancelled.")}\n`);
    process.exit(130);
  }
  if (result.selectedNames === null) return undefined;
  return result.selectedNames.join(",");
}

async function pickEnabledRuleIds(
  opts: CliOptions,
): Promise<string[] | null> {
  if (opts.scope === "all") return allRuleIds;
  if (opts.scope === "recommended") {
    return RECOMMENDED_RULE_IDS.filter((id) => allRuleIds.includes(id));
  }
  if (opts.yes || opts.full) return allRuleIds;
  if (isMachineMode(opts)) return allRuleIds;
  if (!process.stdin.isTTY) return allRuleIds;

  const { promptScanScope } = await import("./utils/prompt-scope.js");
  const result = await promptScanScope();
  if (!result) {
    process.stderr.write(`${pc.dim("Cancelled.")}\n`);
    process.exit(130);
  }
  return result.enabledRuleIds;
}

function buildScopeIgnore(
  enabledRuleIds: string[] | null,
): { rules: string[] } | undefined {
  if (!enabledRuleIds) return undefined;
  const enabled = new Set(enabledRuleIds);
  const disabled = allRuleIds.filter((id) => !enabled.has(id));
  return { rules: disabled };
}

async function runOnce(
  directory: string,
  opts: CliOptions,
  enabledRuleIds: string[] | null = null,
  svelteMajorOverride: 4 | 5 | undefined = undefined,
): Promise<DiagnoseResult> {
  const diffOption =
    opts.staged
      ? { staged: true }
      : opts.diff !== undefined
        ? { base: typeof opts.diff === "string" ? opts.diff : undefined }
        : undefined;

  const useSpinner = !opts.json && !opts.score && !opts.annotations;
  const spin = useSpinner
    ? ora({ text: STAGE_LABELS.detecting, color: "cyan" }).start()
    : null;
  try {
    const scopeIgnore = buildScopeIgnore(enabledRuleIds);
    const result = await scan(directory, {
      lint: opts.lint,
      deadCode: opts.deadCode,
      diff: diffOption,
      project: opts.project,
      svelteMajorOverride,
      configOverrides: {
        respectInlineDisables: opts.respectInlineDisables,
        ...(scopeIgnore ? { ignore: scopeIgnore } : {}),
      },
      onStage: (stage) => {
        if (spin) spin.text = STAGE_LABELS[stage] ?? "Working…";
      },
    });
    spin?.stop();
    return result;
  } catch (err) {
    spin?.fail("Scan failed.");
    throw err;
  }
}

function handleFatalError(err: unknown, opts: CliOptions): void {
  if (opts.json) {
    const report = buildJsonErrorReport(err);
    process.stdout.write(JSON.stringify(report, null, opts.jsonCompact ? 0 : 2));
    process.stdout.write("\n");
  } else {
    const chain = formatErrorChain(err);
    const hint =
      err instanceof SvelteDoctorError && err.hint
        ? err.hint
        : extractMissingPluginHint(err);
    process.stderr.write(`${pc.red("✗ svelte-doctor-cli failed")}\n`);
    for (let i = 0; i < chain.length; i++) {
      const indent = "  ".repeat(i + 1);
      const prefix = i === 0 ? "" : pc.dim("↳ ");
      process.stderr.write(`${indent}${prefix}${chain[i]}\n`);
    }
    if (hint) {
      process.stderr.write(`\n${pc.yellow("hint:")} ${hint}\n`);
    }
  }
  process.exitCode = 1;
}

function renderResult(result: DiagnoseResult, opts: CliOptions): string {
  const explainTarget = opts.explain ?? opts.why;
  if (explainTarget) return explainDiagnostic(result, explainTarget);
  if (opts.json) {
    return JSON.stringify(toJsonReport(result), null, opts.jsonCompact ? 0 : 2);
  }
  if (opts.score) return String(result.score?.score ?? 0);
  if (opts.annotations) return renderAnnotations(result);
  return renderHuman(result, opts.verbose);
}

export async function run(argv: readonly string[]): Promise<void> {
  const program = new Command();
  program
    .name("svelte-doctor-cli")
    .description("Diagnose Svelte 5 codebases. 0–100 health score.")
    .version(VERSION, "-v, --version")
    .argument("[directory]", "project root", ".")
    .option("--no-lint", "skip linting")
    .option("--no-dead-code", "skip dead code detection")
    .option("--verbose", "show every rule and per-file detail", false)
    .option("--score", "output only the score", false)
    .option("--json", "output a single structured JSON report", false)
    .option("--json-compact", "with --json, emit compact JSON (no indentation)", false)
    .option("-y, --yes", "skip prompts", false)
    .option("--full", "skip prompts, always run a full scan", false)
    .option("--diff [base]", "scan only files changed vs base branch")
    .option("--staged", "scan only staged files (for pre-commit hooks)", false)
    .option("--offline", "skip telemetry", false)
    .option(
      "--fail-on <level>",
      "exit with error on diagnostics: error, warning, none",
      "error",
    )
    .option(
      "--annotations",
      "output diagnostics as GitHub Actions annotations",
      false,
    )
    .option("--explain <file:line>", "diagnose why a rule fired")
    .option("--why <file:line>", "alias for --explain")
    .option(
      "--respect-inline-disables",
      "respect inline svelte-doctor-cli-disable* comments (default)",
      true,
    )
    .option(
      "--no-respect-inline-disables",
      "ignore inline svelte-doctor-cli-disable* comments",
    )
    .option(
      "--project <name>",
      "select workspace project (comma-separated for multiple)",
    )
    .option("--watch", "re-scan whenever a tracked file changes", false)
    .option(
      "--scope <choice>",
      "skip the interactive prompt: recommended | all (use --watch / --json / -y to suppress prompt entirely)",
    )
    .option(
      "--svelte-version <version>",
      "override detected Svelte major version: 4 or 5",
    )
    .action(
      async (directory: string, opts: CliOptions): Promise<void> => {
        try {
          if (opts.scope && opts.scope !== "all" && opts.scope !== "recommended") {
            throw new SvelteDoctorError(
              `--scope must be "recommended" or "all" (got "${opts.scope}")`,
              { hint: "Custom rule selection is only available via the interactive prompt." },
            );
          }

          let svelteMajorOverride: 4 | 5 | undefined;
          if (opts.svelteVersion !== undefined) {
            if (opts.svelteVersion !== "4" && opts.svelteVersion !== "5") {
              throw new SvelteDoctorError(
                `--svelte-version must be 4 or 5 (got "${opts.svelteVersion}")`,
                { hint: "Use --svelte-version 4 or --svelte-version 5." },
              );
            }
            svelteMajorOverride = opts.svelteVersion === "4" ? 4 : 5;
          }

          const enabledRuleIds = await pickEnabledRuleIds(opts);
          const projectFilter = await pickWorkspaceProjects(directory, opts);
          if (projectFilter !== undefined) opts.project = projectFilter;

          if (opts.watch) {
            const { runWatch } = await import("./watch.js");
            await runWatch(
              directory,
              opts,
              (dir, o) => runOnce(dir, o, enabledRuleIds, svelteMajorOverride),
              renderResult,
            );
            return;
          }

          const result = await runOnce(directory, opts, enabledRuleIds, svelteMajorOverride);
          const out = renderResult(result, opts);
          if (out) process.stdout.write(`${out}\n`);

          if (shouldExitFailing(result.diagnostics, opts.failOn)) {
            process.exitCode = 1;
          }
        } catch (err) {
          handleFatalError(err, opts);
        }
      },
    );

  program
    .command("install")
    .description(
      "Install the svelte-doctor-cli skill for AI coding agents (Claude Code, Cursor, Codex).",
    )
    .option("-y, --yes", "skip prompts", false)
    .option("--dry-run", "preview which agents would be installed", false)
    .option(
      "--root <directory>",
      "project root in which to install the skill",
      process.cwd(),
    )
    .action(async (opts: { yes: boolean; dryRun: boolean; root: string }) => {
      const { runInstallSkill } = await import("./install-skill.js");
      await runInstallSkill(opts);
    });

  await program.parseAsync(argv);
}

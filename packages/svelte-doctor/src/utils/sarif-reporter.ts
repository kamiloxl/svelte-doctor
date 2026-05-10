import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { allRuleMeta, getRuleMeta } from "../plugin/rule-meta.js";
import { RULE_PREFIX, VERSION } from "../constants.js";
import type { Diagnostic, DiagnoseResult, Severity } from "../types.js";

interface SarifMessage {
  text: string;
}

interface SarifReportingDescriptor {
  id: string;
  name: string;
  shortDescription: SarifMessage;
  fullDescription: SarifMessage;
  helpUri?: string;
  defaultConfiguration: { level: SarifLevel };
  properties?: { tags: string[] };
}

type SarifLevel = "none" | "note" | "warning" | "error";

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: SarifMessage;
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId?: string };
      region: {
        startLine: number;
        startColumn?: number;
        endLine?: number;
        endColumn?: number;
      };
    };
  }>;
  partialFingerprints?: Record<string, string>;
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifReportingDescriptor[];
    };
  };
  originalUriBaseIds: { PROJECTROOT: { uri: string } };
  results: SarifResult[];
  invocations: Array<{ executionSuccessful: boolean }>;
}

interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
}

const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
const TOOL_INFO_URI =
  "https://github.com/kamiloxl/svelte-doctor-cli";

function severityToSarif(severity: Severity): SarifLevel {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

function bareRuleId(ruleId: string): string {
  return ruleId.replace(`${RULE_PREFIX}/`, "");
}

function toRelativeUri(file: string, projectRoot: string): string {
  const rel = relative(projectRoot, file);
  return rel.split("\\").join("/");
}

function descriptorsForReferencedRules(
  diagnostics: Diagnostic[],
): SarifReportingDescriptor[] {
  const seen = new Set<string>();
  const out: SarifReportingDescriptor[] = [];
  const allMeta = new Map(allRuleMeta().map((m) => [m.id, m]));

  for (const d of diagnostics) {
    const id = bareRuleId(d.ruleId);
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = allMeta.get(id) ?? getRuleMeta(d.ruleId);
    const descriptor: SarifReportingDescriptor = {
      id,
      name: id,
      shortDescription: { text: meta?.description ?? d.message },
      fullDescription: { text: meta?.description ?? d.message },
      helpUri: meta?.docsUrl,
      defaultConfiguration: {
        level: severityToSarif(meta?.defaultSeverity ?? d.severity),
      },
      properties: {
        tags: ["svelte-doctor", meta?.category ?? d.category],
      },
    };
    out.push(descriptor);
  }
  return out;
}

function fingerprintFor(d: Diagnostic, projectRoot: string): string {
  const rel = toRelativeUri(d.file, projectRoot);
  return `${bareRuleId(d.ruleId)}:${rel}:${d.line}:${d.column}`;
}

export function buildSarifReport(result: DiagnoseResult): SarifLog {
  const projectRoot = result.project.root;
  const rules = descriptorsForReferencedRules(result.diagnostics);

  const sarifResults: SarifResult[] = result.diagnostics.map((d) => ({
    ruleId: bareRuleId(d.ruleId),
    level: severityToSarif(d.severity),
    message: { text: d.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: toRelativeUri(d.file, projectRoot),
            uriBaseId: "PROJECTROOT",
          },
          region: {
            startLine: Math.max(1, d.line),
            ...(d.column ? { startColumn: d.column } : {}),
            ...(d.endLine ? { endLine: d.endLine } : {}),
            ...(d.endColumn ? { endColumn: d.endColumn } : {}),
          },
        },
      },
    ],
    partialFingerprints: {
      "svelteDoctor/v1": fingerprintFor(d, projectRoot),
    },
  }));

  const run: SarifRun = {
    tool: {
      driver: {
        name: "svelte-doctor",
        version: VERSION,
        informationUri: TOOL_INFO_URI,
        rules,
      },
    },
    originalUriBaseIds: {
      PROJECTROOT: { uri: pathToFileURL(projectRoot).toString() },
    },
    results: sarifResults,
    invocations: [{ executionSuccessful: true }],
  };

  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [run],
  };
}

export function renderSarif(result: DiagnoseResult, compact = false): string {
  return JSON.stringify(buildSarifReport(result), null, compact ? 0 : 2);
}

import { VERSION } from "./constants.js";
import { scan, type ScanOptions } from "./scan.js";
import type {
  Category,
  Diagnostic,
  DiagnoseResult,
  JsonReport,
  JsonReportSummary,
  Severity,
} from "./types.js";

export type {
  Category,
  Diagnostic,
  DiagnoseResult,
  JsonReport,
  JsonReportSummary,
  ProjectInfo,
  Score,
  Severity,
  SvelteDoctorConfig,
} from "./types.js";
export type { ScanOptions } from "./scan.js";

export async function diagnose(
  root: string,
  options: ScanOptions = {},
): Promise<DiagnoseResult> {
  return scan(root, options);
}

export function summarizeDiagnostics(
  diagnostics: Diagnostic[],
): JsonReportSummary {
  const byCategory: Record<Category, number> = {
    "state-effects": 0,
    performance: 0,
    architecture: 0,
    security: 0,
    accessibility: 0,
    "dead-code": 0,
  };
  const bySeverity: Record<Severity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };
  for (const d of diagnostics) {
    byCategory[d.category]++;
    bySeverity[d.severity]++;
  }
  return { total: diagnostics.length, byCategory, bySeverity };
}

export function toJsonReport(result: DiagnoseResult): JsonReport {
  return {
    ok: true,
    version: VERSION,
    mode: result.mode,
    diffInfo: result.diffInfo,
    project: result.project,
    score: result.score,
    summary: summarizeDiagnostics(result.diagnostics),
    diagnostics: result.diagnostics,
  };
}

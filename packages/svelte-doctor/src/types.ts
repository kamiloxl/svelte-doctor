export type Severity = "error" | "warning" | "info";

export type Category =
  | "state-effects"
  | "performance"
  | "architecture"
  | "security"
  | "accessibility"
  | "dead-code";

export type Framework = "sveltekit" | "vite-svelte" | "unknown";

export type SvelteMajor = 4 | 5;

export type SvelteVersionSource =
  | "package.json"
  | "node_modules"
  | "override"
  | "assumed";

export interface ProjectInfo {
  root: string;
  framework: Framework;
  svelteVersion: string | null;
  svelteMajor: SvelteMajor;
  svelteVersionSource: SvelteVersionSource;
  hasTypeScript: boolean;
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
}

export interface Diagnostic {
  ruleId: string;
  category: Category;
  severity: Severity;
  message: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  suppressionHint?: string;
}

export type ScoreLabel = "Great" | "Needs work" | "Critical";

export interface Score {
  score: number;
  label: ScoreLabel;
}

export interface DiagnoseResult {
  project: ProjectInfo;
  diagnostics: Diagnostic[];
  score: Score | null;
  mode: JsonReportMode;
  diffInfo?: JsonReportDiffInfo;
}

export interface IgnoreOverride {
  files: string[];
  rules?: string[];
}

export interface SvelteDoctorConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
    overrides?: IgnoreOverride[];
  };
  lint?: boolean;
  deadCode?: boolean;
  verbose?: boolean;
  failOn?: "error" | "warning" | "none";
  respectInlineDisables?: boolean;
  adoptExistingLintConfig?: boolean;
}

export interface JsonReportSummary {
  total: number;
  byCategory: Record<Category, number>;
  bySeverity: Record<Severity, number>;
}

export type JsonReportMode = "full" | "diff" | "staged";

export interface JsonReportDiffInfo {
  base?: string;
  staged?: boolean;
}

export interface JsonReport {
  ok: boolean;
  version: string;
  mode: JsonReportMode;
  diffInfo?: JsonReportDiffInfo;
  project: ProjectInfo;
  score: Score | null;
  summary: JsonReportSummary;
  diagnostics: Diagnostic[];
}

export interface JsonReportError {
  ok: false;
  version: string;
  error: string;
  errorChain?: string[];
  hint?: string;
}

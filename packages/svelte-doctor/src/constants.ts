import type { Category, ScoreLabel, Severity } from "./types.js";

export const VERSION = "0.5.0";

export const SCORE_THRESHOLDS = {
  GREAT: 75,
  NEEDS_WORK: 50,
} as const;

export function labelForScore(score: number): ScoreLabel {
  if (score >= SCORE_THRESHOLDS.GREAT) return "Great";
  if (score >= SCORE_THRESHOLDS.NEEDS_WORK) return "Needs work";
  return "Critical";
}

// Used for sorting/display order — not for score calculation (see SEVERITY_PENALTY_WEIGHT).
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  error: 3,
  warning: 1,
  info: 0,
};

export const PENALTY_SCALE = 0.5;

export const SEVERITY_PENALTY_WEIGHT: Record<Severity, number> = {
  error: 3.0,
  warning: 1.0,
  info: 0,
};

export const CATEGORY_PENALTY_WEIGHT: Record<Category, number> = {
  security: 3.0,
  "state-effects": 1.5,
  performance: 1.0,
  accessibility: 1.0,
  architecture: 0.5,
  "dead-code": 0.5,
};
export const SUPPRESSION_NEAR_MISS_MAX_LINES = 10;

export const BUILTIN_IGNORED_DIRECTORIES = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".svelte-kit",
  ".output",
  ".vercel",
  ".netlify",
];

export const PROJECT_BOUNDARY_MARKERS = [
  ".git",
  "pnpm-workspace.yaml",
  "lerna.json",
  "nx.json",
  "rush.json",
];

export const CATEGORY_LABEL: Record<Category, string> = {
  "state-effects": "State & effects",
  performance: "Performance",
  architecture: "Architecture",
  security: "Security",
  accessibility: "Accessibility",
  "dead-code": "Dead code",
};

export const RULE_PREFIX = "svelte-doctor-cli";
export const SUPPRESSION_DIRECTIVE = "svelte-doctor-cli-disable-next-line";
export const CONFIG_FILE_NAME = "svelte-doctor-cli.config.json";
export const PACKAGE_JSON_KEY = "svelteDoctor";

export const SCORE_BAR_WIDTH = 24;
export const NON_VERBOSE_RULES_PER_CATEGORY = 3;
export const NON_VERBOSE_FILES_PER_RULE = 3;
export const DOCS_BASE_URL = "https://github.com/kamiloxl/svelte-doctor-cli/blob/main/packages/svelte-doctor-cli/docs/rules";

import { VERSION } from "../constants.js";
import type { JsonReportError } from "../types.js";

const MISSING_MODULE_PATTERNS = [
  /Cannot find package '([^']+)'/,
  /Cannot find module '([^']+)'/,
  /Failed to load plugin "([^"]+)"/,
];

export class SvelteDoctorError extends Error {
  hint?: string;
  constructor(message: string, options?: { cause?: unknown; hint?: string }) {
    super(message, { cause: options?.cause });
    this.name = "SvelteDoctorError";
    if (options?.hint) this.hint = options.hint;
  }
}

export function formatErrorChain(error: unknown): string[] {
  const chain: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 8) {
    if (current instanceof Error) {
      chain.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      chain.push(String(current));
      break;
    }
    depth++;
  }
  return chain;
}

export function extractMissingPluginHint(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const stack = [error.message, ...formatErrorChain(error)].join("\n");
  for (const pattern of MISSING_MODULE_PATTERNS) {
    const match = stack.match(pattern);
    if (!match) continue;
    const pkg = match[1];
    if (pkg.startsWith("node:") || pkg.startsWith(".")) continue;
    return `Looks like \`${pkg}\` is referenced in your eslint.config but not installed. Try: pnpm add -D ${pkg}`;
  }
  return undefined;
}

export function buildJsonErrorReport(error: unknown): JsonReportError {
  const chain = formatErrorChain(error);
  const hint =
    error instanceof SvelteDoctorError && error.hint
      ? error.hint
      : extractMissingPluginHint(error);
  return {
    ok: false,
    version: VERSION,
    error: chain[0] ?? "Unknown error",
    errorChain: chain.length > 1 ? chain : undefined,
    hint,
  };
}

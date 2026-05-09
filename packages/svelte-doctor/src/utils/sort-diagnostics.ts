import type { Category, Diagnostic, Severity } from "../types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const CATEGORY_ORDER: Record<Category, number> = {
  "state-effects": 0,
  security: 1,
  performance: 2,
  accessibility: 3,
  architecture: 4,
  "dead-code": 5,
};

export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    const cat = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (cat !== 0) return cat;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

export function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of diagnostics) {
    const key = `${d.file}:${d.line}:${d.column}:${d.ruleId}:${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

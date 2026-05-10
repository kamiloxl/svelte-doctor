import { relative } from "node:path";
import { CATEGORY_LABEL, VERSION } from "../constants.js";
import { getRuleMeta } from "../plugin/rule-meta.js";
import type { Category, Diagnostic, DiagnoseResult } from "../types.js";

const SEVERITY_BADGE: Record<Diagnostic["severity"], string> = {
  error: "🔴 error",
  warning: "🟡 warn",
  info: "🔵 info",
};

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function groupByCategory(
  diagnostics: Diagnostic[],
): Map<Category, Diagnostic[]> {
  const map = new Map<Category, Diagnostic[]>();
  for (const d of diagnostics) {
    const list = map.get(d.category) ?? [];
    list.push(d);
    map.set(d.category, list);
  }
  return map;
}

function severityRank(s: Diagnostic["severity"]): number {
  if (s === "error") return 0;
  if (s === "warning") return 1;
  return 2;
}

function sortBySeverity(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity);
    if (r !== 0) return r;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });
}

export interface MarkdownReportOptions {
  /** Hide the per-issue table (only show the summary). */
  summaryOnly?: boolean;
  /** Cap on rendered rows per category. Default 50. */
  maxRowsPerCategory?: number;
}

export function renderMarkdownReport(
  result: DiagnoseResult,
  options: MarkdownReportOptions = {},
): string {
  const { project, score, diagnostics, mode, diffInfo } = result;
  const lines: string[] = [];
  const maxRows = options.maxRowsPerCategory ?? 50;

  lines.push(`# svelte-doctor report`);
  lines.push("");
  lines.push(`**Version:** \`${VERSION}\``);
  lines.push(`**Mode:** \`${mode}\`${diffInfo?.base ? ` (vs \`${diffInfo.base}\`)` : ""}${diffInfo?.staged ? " (staged)" : ""}`);
  lines.push(`**Project:** \`${project.root}\``);
  lines.push(
    `**Framework:** ${project.framework} · **Svelte:** ${project.svelteMajor}`,
  );
  if (score) {
    lines.push(`**Score:** **${score.score}/100** — ${score.label}`);
  }
  lines.push("");

  if (!diagnostics.length) {
    lines.push("✅ **No issues found.**");
    return lines.join("\n");
  }

  const grouped = groupByCategory(diagnostics);
  lines.push("## Summary");
  lines.push("");
  lines.push("| Category | Issues |");
  lines.push("|---|---:|");
  for (const [cat, items] of grouped) {
    lines.push(`| ${CATEGORY_LABEL[cat]} | ${items.length} |`);
  }
  lines.push(`| **Total** | **${diagnostics.length}** |`);
  lines.push("");

  if (options.summaryOnly) return lines.join("\n");

  for (const [cat, items] of grouped) {
    lines.push(`## ${CATEGORY_LABEL[cat]} (${items.length})`);
    lines.push("");
    lines.push("| Severity | Rule | File | Line | Message |");
    lines.push("|---|---|---|---:|---|");
    const sorted = sortBySeverity(items).slice(0, maxRows);
    for (const d of sorted) {
      const rel = relative(project.root, d.file).split("\\").join("/");
      const meta = getRuleMeta(d.ruleId);
      const ruleLink = meta?.docsUrl
        ? `[${escapeCell(d.ruleId)}](${meta.docsUrl})`
        : `\`${escapeCell(d.ruleId)}\``;
      lines.push(
        `| ${SEVERITY_BADGE[d.severity]} | ${ruleLink} | \`${escapeCell(rel)}\` | ${d.line} | ${escapeCell(d.message)} |`,
      );
    }
    if (items.length > maxRows) {
      lines.push("");
      lines.push(`_…and ${items.length - maxRows} more in this category._`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

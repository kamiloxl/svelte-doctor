import { describe, expect, it } from "vitest";
import { renderMarkdownReport } from "../src/utils/markdown-reporter.js";
import type { DiagnoseResult } from "../src/types.js";

function makeResult(): DiagnoseResult {
  return {
    project: {
      root: "/tmp/proj",
      framework: "sveltekit",
      svelteVersion: "5.0.0",
      svelteMajor: 5,
      svelteVersionSource: "package.json",
      hasTypeScript: true,
      packageManager: "pnpm",
    },
    diagnostics: [
      {
        ruleId: "svelte-doctor-cli/no-eval",
        category: "security",
        severity: "error",
        message: "eval is unsafe",
        file: "/tmp/proj/src/lib/x.ts",
        line: 3,
        column: 5,
      },
    ],
    score: { score: 50, label: "Needs work" },
    mode: "full",
  };
}

describe("renderMarkdownReport", () => {
  it("includes summary table and per-category section", () => {
    const md = renderMarkdownReport(makeResult());
    expect(md).toContain("# svelte-doctor report");
    expect(md).toContain("**Score:** **50/100**");
    expect(md).toContain("## Summary");
    expect(md).toContain("| Security | 1 |");
    expect(md).toContain("`src/lib/x.ts`");
  });

  it("renders 'no issues' message when diagnostics are empty", () => {
    const r = makeResult();
    r.diagnostics = [];
    expect(renderMarkdownReport(r)).toContain("No issues found.");
  });
});

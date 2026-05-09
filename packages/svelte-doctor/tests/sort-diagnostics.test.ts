import { describe, expect, it } from "vitest";
import {
  dedupeDiagnostics,
  sortDiagnostics,
} from "../src/utils/sort-diagnostics.js";
import type { Diagnostic } from "../src/types.js";

const make = (
  partial: Partial<Diagnostic> & Pick<Diagnostic, "severity" | "ruleId">,
): Diagnostic => ({
  ruleId: partial.ruleId,
  category: partial.category ?? "architecture",
  severity: partial.severity,
  message: partial.message ?? "x",
  file: partial.file ?? "/a.svelte",
  line: partial.line ?? 1,
  column: partial.column ?? 1,
  endLine: partial.endLine,
  endColumn: partial.endColumn,
});

describe("sortDiagnostics", () => {
  it("orders errors before warnings", () => {
    const sorted = sortDiagnostics([
      make({ severity: "warning", ruleId: "a" }),
      make({ severity: "error", ruleId: "b" }),
    ]);
    expect(sorted.map((d) => d.severity)).toEqual(["error", "warning"]);
  });

  it("orders state-effects before security before performance", () => {
    const sorted = sortDiagnostics([
      make({ severity: "error", ruleId: "p", category: "performance" }),
      make({ severity: "error", ruleId: "s", category: "security" }),
      make({ severity: "error", ruleId: "e", category: "state-effects" }),
    ]);
    expect(sorted.map((d) => d.category)).toEqual([
      "state-effects",
      "security",
      "performance",
    ]);
  });

  it("orders by file, then line, then column", () => {
    const sorted = sortDiagnostics([
      make({ severity: "error", ruleId: "x", file: "/b.svelte", line: 1 }),
      make({ severity: "error", ruleId: "x", file: "/a.svelte", line: 5 }),
      make({ severity: "error", ruleId: "x", file: "/a.svelte", line: 2, column: 10 }),
      make({ severity: "error", ruleId: "x", file: "/a.svelte", line: 2, column: 1 }),
    ]);
    expect(sorted.map((d) => `${d.file}:${d.line}:${d.column}`)).toEqual([
      "/a.svelte:2:1",
      "/a.svelte:2:10",
      "/a.svelte:5:1",
      "/b.svelte:1:1",
    ]);
  });

  it("falls back to ruleId for full stability", () => {
    const sorted = sortDiagnostics([
      make({ severity: "error", ruleId: "z" }),
      make({ severity: "error", ruleId: "a" }),
    ]);
    expect(sorted.map((d) => d.ruleId)).toEqual(["a", "z"]);
  });
});

describe("dedupeDiagnostics", () => {
  it("removes diagnostics with identical key", () => {
    const a = make({ severity: "error", ruleId: "x", file: "/a.svelte", line: 1 });
    const out = dedupeDiagnostics([a, { ...a }]);
    expect(out).toHaveLength(1);
  });

  it("keeps diagnostics that differ in any key field", () => {
    const a = make({ severity: "error", ruleId: "x", file: "/a.svelte", line: 1 });
    const b = make({ severity: "error", ruleId: "x", file: "/a.svelte", line: 2 });
    const c = make({ severity: "error", ruleId: "y", file: "/a.svelte", line: 1 });
    const out = dedupeDiagnostics([a, b, c]);
    expect(out).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import {
  applySuppressions,
  applySuppressionsAndDetectUnused,
} from "../src/utils/suppression.js";
import type { Diagnostic } from "../src/types.js";

function makeDiag(file: string, line: number, ruleId: string): Diagnostic {
  return {
    file,
    line,
    column: 1,
    severity: "error",
    message: "x",
    ruleId,
    category: "state-effects",
  };
}

describe("applySuppressions", () => {
  it("suppresses next line via // comment", () => {
    const file = "/x/a.svelte";
    const source = [
      "<script>",
      "  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect",
      "  $effect(() => fetch('/x'));",
      "</script>",
    ].join("\n");
    const diagnostics = [makeDiag(file, 3, "svelte-doctor-cli/no-fetch-in-effect")];
    const filtered = applySuppressions(
      diagnostics,
      new Map([[file, source]]),
    );
    expect(filtered).toHaveLength(0);
  });

  it("suppresses next line via HTML comment", () => {
    const file = "/x/a.svelte";
    const source = [
      "<!-- svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-unsafe-html-binding -->",
      "{@html dirty}",
    ].join("\n");
    const diagnostics = [makeDiag(file, 2, "svelte-doctor-cli/no-unsafe-html-binding")];
    const filtered = applySuppressions(diagnostics, new Map([[file, source]]));
    expect(filtered).toHaveLength(0);
  });

  it("supports comma-separated rule list", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/a, svelte-doctor-cli/b",
      "broken();",
    ].join("\n");
    const filtered = applySuppressions(
      [makeDiag(file, 2, "svelte-doctor-cli/a"), makeDiag(file, 2, "svelte-doctor-cli/b")],
      new Map([[file, source]]),
    );
    expect(filtered).toHaveLength(0);
  });

  it("does not suppress unrelated rules", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect",
      "$effect(() => total = a + b);",
    ].join("\n");
    const filtered = applySuppressions(
      [makeDiag(file, 2, "svelte-doctor-cli/prefer-derived-over-effect")],
      new Map([[file, source]]),
    );
    expect(filtered).toHaveLength(1);
  });

  it("accepts bare rule id without prefix", () => {
    const file = "/x/a.svelte";
    const source = "// svelte-doctor-cli-disable-next-line no-fetch-in-effect\nfetch();";
    const filtered = applySuppressions(
      [makeDiag(file, 2, "svelte-doctor-cli/no-fetch-in-effect")],
      new Map([[file, source]]),
    );
    expect(filtered).toHaveLength(0);
  });
});

describe("applySuppressionsAndDetectUnused — near-miss", () => {
  it("attaches a near-miss hint when comment is too far above the diagnostic", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect", // 1
      "let unrelated = 1;",                                                   // 2
      "let other = 2;",                                                       // 3
      "$effect(() => fetch('/x'));",                                          // 4
    ].join("\n");
    const diagnostics = [makeDiag(file, 4, "svelte-doctor-cli/no-fetch-in-effect")];
    const result = applySuppressionsAndDetectUnused(
      diagnostics,
      new Map([[file, source]]),
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].suppressionHint).toMatch(/sits at line 1/);
    expect(result.diagnostics[0].suppressionHint).toMatch(/2 lines/);
  });

  it("attaches a hint when adjacent comment lists wrong rule id", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-other-rule",
      "$effect(() => fetch('/x'));",
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [makeDiag(file, 2, "svelte-doctor-cli/no-fetch-in-effect")],
      new Map([[file, source]]),
    );
    expect(result.diagnostics[0].suppressionHint).toMatch(/Use the comma form/);
  });
});

describe("applySuppressionsAndDetectUnused — unused-disable", () => {
  it("reports unused suppression directives when nothing fired at the next line", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect",
      "let totallyFine = 1;",
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [],
      new Map([[file, source]]),
    );
    expect(result.unusedDisables).toHaveLength(1);
    expect(result.unusedDisables[0].ruleId).toBe(
      "svelte-doctor-cli/unused-disable-directive",
    );
    expect(result.unusedDisables[0].line).toBe(1);
  });

  it("does not report when the directive actually suppresses something", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect",
      "$effect(() => fetch('/x'));",
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [makeDiag(file, 2, "svelte-doctor-cli/no-fetch-in-effect")],
      new Map([[file, source]]),
    );
    expect(result.unusedDisables).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });
});

describe("applySuppressionsAndDetectUnused — stacks", () => {
  it("respects stacked disable comments (each rule on its own line)", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect", // 1
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-cascading-state-in-effect", // 2
      "$effect(() => { fetch('/x'); a = 1; b = 2; });",                                // 3
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [
        makeDiag(file, 3, "svelte-doctor-cli/no-fetch-in-effect"),
        makeDiag(file, 3, "svelte-doctor-cli/no-cascading-state-in-effect"),
      ],
      new Map([[file, source]]),
    );
    expect(result.diagnostics).toHaveLength(0);
    expect(result.unusedDisables).toHaveLength(0);
  });

  it("issues one unused-disable per stack, not per comment", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/a, svelte-doctor-cli/b",
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/c",
      "let nothing = 1;",
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [],
      new Map([[file, source]]),
    );
    expect(result.unusedDisables).toHaveLength(1);
    expect(result.unusedDisables[0].line).toBe(1);
  });
});

describe("applySuppressionsAndDetectUnused — multiline tag opener", () => {
  it("suppresses diagnostics inside multiline opening tag", () => {
    const file = "/x/a.svelte";
    const source = [
      '<!-- svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-href-javascript -->',
      "<a",
      '  href="javascript:void(0)"',
      ">x</a>",
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [makeDiag(file, 3, "svelte-doctor-cli/no-href-javascript")],
      new Map([[file, source]]),
    );
    expect(result.diagnostics).toHaveLength(0);
    expect(result.unusedDisables).toHaveLength(0);
  });
});

describe("applySuppressionsAndDetectUnused — de-duplication", () => {
  it("does not double-report a near-miss as unused-disable", () => {
    const file = "/x/a.svelte";
    const source = [
      "// svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect", // 1
      "let unrelated = 1;",                                                   // 2
      "$effect(() => fetch('/x'));",                                          // 3
    ].join("\n");
    const result = applySuppressionsAndDetectUnused(
      [makeDiag(file, 3, "svelte-doctor-cli/no-fetch-in-effect")],
      new Map([[file, source]]),
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].suppressionHint).toBeDefined();
    expect(result.unusedDisables).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { buildSarifReport } from "../src/utils/sarif-reporter.js";
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
      {
        ruleId: "svelte-doctor-cli/component-too-large",
        category: "architecture",
        severity: "warning",
        message: "too many lines",
        file: "/tmp/proj/src/lib/Big.svelte",
        line: 1,
        column: 1,
      },
    ],
    score: { score: 50, label: "Needs work" },
    mode: "full",
  };
}

describe("buildSarifReport", () => {
  const sarif = buildSarifReport(makeResult());

  it("conforms to SARIF 2.1.0 envelope", () => {
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.$schema).toContain("sarif-spec");
  });

  it("emits one rule descriptor per unique rule", () => {
    const rules = sarif.runs[0].tool.driver.rules;
    expect(rules.map((r) => r.id).sort()).toEqual([
      "component-too-large",
      "no-eval",
    ]);
  });

  it("emits a result per diagnostic with relative URIs", () => {
    const results = sarif.runs[0].results;
    expect(results).toHaveLength(2);
    expect(results[0].level).toBe("error");
    expect(results[1].level).toBe("warning");
    expect(results[0].locations[0].physicalLocation.artifactLocation.uri)
      .toBe("src/lib/x.ts");
    expect(
      results[0].locations[0].physicalLocation.artifactLocation.uriBaseId,
    ).toBe("PROJECTROOT");
  });

  it("emits stable partialFingerprints", () => {
    const results = sarif.runs[0].results;
    expect(results[0].partialFingerprints?.["svelteDoctor/v1"]).toBe(
      "no-eval:src/lib/x.ts:3:5",
    );
  });
});

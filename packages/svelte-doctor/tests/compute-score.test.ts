import { describe, expect, it } from "vitest";
import { computeScore } from "../src/scan.js";
import type { Diagnostic } from "../src/types.js";

const make = (
  partial: Partial<Diagnostic> & Pick<Diagnostic, "severity" | "ruleId" | "category">,
): Diagnostic => ({
  ruleId: partial.ruleId,
  category: partial.category,
  severity: partial.severity,
  message: "x",
  file: "/a.svelte",
  line: 1,
  column: 1,
});

const repeat = (d: Diagnostic, n: number): Diagnostic[] =>
  Array.from({ length: n }, (_, i) => ({ ...d, line: i + 1 }));

describe("computeScore", () => {
  it("returns 100 for no diagnostics", () => {
    const { score, label } = computeScore([]);
    expect(score).toBe(100);
    expect(label).toBe("Great");
  });

  it("returns ~100 for a single dead-code warning", () => {
    const d = make({ ruleId: "unused-export", severity: "warning", category: "dead-code" });
    const { score, label } = computeScore([d]);
    // penalty = 0.5 × 1.0 × 0.5 × log2(2) = 0.25 → score 100
    expect(score).toBe(100);
    expect(label).toBe("Great");
  });

  it("returns 96 for a single XSS error", () => {
    const d = make({ ruleId: "no-unsafe-html", severity: "error", category: "security" });
    const { score } = computeScore([d]);
    // penalty = 0.5 × 3.0 × 3.0 × log2(2) = 4.5 → score 96 (rounded)
    expect(score).toBe(96);
  });

  it("score is lower for more occurrences of the same rule", () => {
    const base = make({ ruleId: "no-unsafe-html", severity: "error", category: "security" });
    const { score: score1 } = computeScore([base]);
    const { score: score20 } = computeScore(repeat(base, 20));
    expect(score20).toBeLessThan(score1);
  });

  it("the same ruleId is grouped — not penalised per-occurrence linearly", () => {
    const base = make({ ruleId: "no-unsafe-html", severity: "error", category: "security" });
    const { score: score50 } = computeScore(repeat(base, 50));
    // linear penalty for 50 occurrences would be 50 × 4.5 = 225 → score -125
    // log penalty: 0.5 × 9 × log2(51) ≈ 25.5 → score 74
    expect(score50).toBeGreaterThan(0);
  });

  it("score never goes below 0", () => {
    const rules = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const diagnostics = rules.flatMap((id) =>
      repeat(make({ ruleId: id, severity: "error", category: "security" }), 100),
    );
    const { score } = computeScore(diagnostics);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("labels: >=75 Great, 50-74 Needs work, <50 Critical", () => {
    const xss = make({ ruleId: "xss", severity: "error", category: "security" });
    // 5 security errors: penalty = 0.5 × 9 × log2(6) ≈ 11.6 → 88 Great
    expect(computeScore(repeat(xss, 5)).label).toBe("Great");

    // 1 security error rule with 50 occurrences:
    // penalty = 0.5 × 9 × log2(51) ≈ 25.5 → score 74 (Needs work)
    const needsWork = repeat(make({ ruleId: "xss-needs-work", severity: "error", category: "security" }), 50);
    const needsWorkScore = computeScore(needsWork).score;
    expect(needsWorkScore).toBeGreaterThanOrEqual(50);
    expect(needsWorkScore).toBeLessThan(75);

    // 2 security error rules with 100 occurrences each:
    // penalty per rule = 0.5 × 9 × log2(101) ≈ 30.0 → total ≈ 60 → score 40 (Critical)
    const criticalRules = ["crit-a", "crit-b"].flatMap((id) =>
      repeat(make({ ruleId: id, severity: "error", category: "security" }), 100),
    );
    expect(computeScore(criticalRules).score).toBeLessThan(50);
  });

  it("real-world example scores in 68-75 range (Needs work)", () => {
    const diagnostics: Diagnostic[] = [
      // 5 XSS errors
      ...repeat(make({ ruleId: "no-unsafe-html-binding", severity: "error", category: "security" }), 5),
      // 20 prop mutations
      ...repeat(make({ ruleId: "no-mutation-of-export-let", severity: "error", category: "state-effects" }), 20),
      // 3 leaked subscriptions
      ...repeat(make({ ruleId: "no-leaked-subscriptions", severity: "warning", category: "state-effects" }), 3),
      // 22 oversized components
      ...repeat(make({ ruleId: "component-too-large", severity: "warning", category: "architecture" }), 22),
      // 8 unused exports
      ...repeat(make({ ruleId: "unused-export", severity: "warning", category: "dead-code" }), 8),
      // 5 unused types
      ...repeat(make({ ruleId: "unused-type", severity: "warning", category: "dead-code" }), 5),
      // 3 unused files
      ...repeat(make({ ruleId: "unused-file", severity: "warning", category: "dead-code" }), 3),
    ];
    const { score, label } = computeScore(diagnostics);
    expect(score).toBeGreaterThanOrEqual(68);
    expect(score).toBeLessThanOrEqual(75);
    expect(label).toBe("Needs work");
  });
});

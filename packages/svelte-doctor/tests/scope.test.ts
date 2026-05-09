import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_RULE_IDS,
  allRuleIds,
} from "../src/eslint-plugin.js";

describe("RECOMMENDED rule subset", () => {
  it("contains all error-severity rules", () => {
    const errorRuleIds = [
      "no-fetch-in-effect",
      "no-mutation-of-props",
      "no-unsafe-html-binding",
      "no-href-javascript",
      "server-only-import-in-client",
      "no-fetch-in-load-without-event",
    ];
    for (const id of errorRuleIds) {
      expect(RECOMMENDED_RULE_IDS).toContain(id);
    }
  });

  it("excludes architecture-style warnings", () => {
    const stylisticIds = [
      "component-too-large",
      "no-cascading-state-in-effect",
      "no-effect-without-cleanup",
      "no-array-index-as-each-key",
    ];
    for (const id of stylisticIds) {
      expect(RECOMMENDED_RULE_IDS).not.toContain(id);
    }
  });

  it("every recommended id is a real rule", () => {
    for (const id of RECOMMENDED_RULE_IDS) {
      expect(allRuleIds).toContain(id);
    }
  });

  it("recommended is a strict subset of all", () => {
    expect(RECOMMENDED_RULE_IDS.length).toBeLessThan(allRuleIds.length);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_RULE_IDS,
  allRuleIds,
} from "../src/eslint-plugin.js";
import { scan } from "../src/scan.js";

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

describe("--svelte-version override", () => {
  it("forces svelte4 preset on a Svelte 5 project", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "svelte-doctor-scope-svelte-version-"));
    try {
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({
          name: "fixture",
          type: "module",
          dependencies: { svelte: "^5.0.0", vite: "^5.0.0" },
        }),
      );
      mkdirSync(join(cwd, "src"));
      writeFileSync(
        join(cwd, "src", "App.svelte"),
        `<script>
  export let name;
  name = 'x';
</script>
`,
      );

      const result = await scan(cwd, {
        deadCode: false,
        svelteMajorOverride: 4,
      });

      expect(result.project.svelteMajor).toBe(4);
      expect(result.project.svelteVersionSource).toBe("override");
      const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
      expect(ruleIds).toContain("svelte-doctor-cli/no-mutation-of-export-let");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

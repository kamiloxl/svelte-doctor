import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-effect-without-cleanup.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-effect-without-cleanup", () => {
  it("validates fixtures", () => {
    tester.run("no-effect-without-cleanup", rule, {
      valid: [
        {
          code: "$effect(() => { const t = setInterval(tick, 1000); return () => clearInterval(t); });",
        },
        {
          code: "$effect(() => { window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); });",
        },
        { code: "$effect(() => { console.log('no listener'); });" },
      ],
      invalid: [
        {
          code: "$effect(() => { setInterval(tick, 1000); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "$effect(() => { window.addEventListener('click', go); });",
          errors: [{ messageId: "missingCleanup" }],
        },
      ],
    });
  });
});

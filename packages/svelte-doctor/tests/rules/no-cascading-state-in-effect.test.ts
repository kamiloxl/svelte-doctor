import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-cascading-state-in-effect.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-cascading-state-in-effect", () => {
  it("validates fixtures", () => {
    tester.run("no-cascading-state-in-effect", rule, {
      valid: [
        { code: "$effect(() => { x = 1; });" },
        { code: "$effect(() => { console.log('side'); });" },
      ],
      invalid: [
        {
          code: "$effect(() => { x = 1; y = 2; });",
          errors: [{ messageId: "cascading" }],
        },
        {
          code: "$effect(() => { x = 1; y = 2; z = 3; });",
          errors: [{ messageId: "cascading" }],
        },
      ],
    });
  });
});

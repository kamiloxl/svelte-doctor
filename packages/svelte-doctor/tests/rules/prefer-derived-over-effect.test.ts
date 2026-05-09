import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/prefer-derived-over-effect.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("prefer-derived-over-effect", () => {
  it("validates fixtures", () => {
    tester.run("prefer-derived-over-effect", rule, {
      valid: [
        { code: "$effect(() => { fetch('/x'); });" },
        { code: "$effect(() => { console.log('go'); });" },
        { code: "$effect(() => () => clearInterval(t));" },
      ],
      invalid: [
        {
          code: "$effect(() => { total = count + 1; });",
          errors: [{ messageId: "preferDerived" }],
        },
        {
          code: "$effect(() => { full = a + b; uppercase = b; });",
          errors: [{ messageId: "preferDerived" }],
        },
      ],
    });
  });
});

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/prefer-reactive-statement.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("prefer-reactive-statement", () => {
  it("validates fixtures", () => {
    tester.run("prefer-reactive-statement", rule, {
      valid: [
        // No props in module — nothing to derive from.
        { code: "let total = 1 + 2;" },
        // Reactive statement is the correct form — passes.
        { code: "export let count; $: doubled = count * 2;" },
        // Const literal initializer, no prop reference.
        { code: "export let count; const PI = 3.14;" },
        // Local derived from another local — out of scope for this heuristic.
        { code: "let a = 1; let b = a + 1;" },
      ],
      invalid: [
        {
          code: "export let count; let doubled = count * 2;",
          errors: [{ messageId: "preferReactive", data: { name: "doubled" } }],
        },
        {
          code: "export let user; let label = user.name + '!';",
          errors: [{ messageId: "preferReactive", data: { name: "label" } }],
        },
      ],
    });
  });
});

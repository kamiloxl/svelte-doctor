import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-circular-reactivity.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-circular-reactivity", () => {
  it("validates fixtures", () => {
    tester.run("no-circular-reactivity", rule, {
      valid: [
        {
          code: `
            let count = $state(0);
            let doubled = $derived(count * 2);
          `,
        },
        {
          code: `
            let total = $state(0);
            $effect(() => { total = compute(); });
          `,
        },
      ],
      invalid: [
        {
          code: `
            let a = $state(0);
            let b = $derived(a + 1);
            $effect(() => { a = b + 1; });
          `,
          errors: [{ messageId: "circular" }],
        },
      ],
    });
  });
});

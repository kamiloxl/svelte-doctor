import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-effect-chain.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-effect-chain", () => {
  it("validates fixtures", () => {
    tester.run("no-effect-chain", rule, {
      valid: [
        // single effect — no chain
        { code: "$effect(() => { count = a + b; });" },
        // independent effects (no shared state between them)
        {
          code: `
            $effect(() => { foo = a + 1; });
            $effect(() => { bar = b + 1; });
          `,
        },
      ],
      invalid: [
        // classic chain: first effect writes "page", second reads it and writes "data"
        {
          code: `
            $effect(() => { page = computePage(query); });
            $effect(() => { data = transform(page); });
          `,
          errors: [{ messageId: "effectChain" }],
        },
        // longer chain: A → B → C
        {
          code: `
            $effect(() => { a = inputA; });
            $effect(() => { b = a * 2; });
          `,
          errors: [{ messageId: "effectChain" }],
        },
      ],
    });
  });
});

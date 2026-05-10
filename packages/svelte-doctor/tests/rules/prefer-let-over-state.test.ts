import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/prefer-let-over-state.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("prefer-let-over-state", () => {
  it("validates fixtures", () => {
    tester.run("prefer-let-over-state", rule, {
      valid: [
        // read in derived — needs reactive tracking
        {
          code: "let count = $state(0); let doubled = $derived(count * 2);",
        },
        // read in effect — needs reactive tracking
        { code: "let total = $state(0); $effect(() => console.log(total));" },
        // read elsewhere — keep
        { code: "let x = $state(0); function show() { return x + 1; }" },
        // never assigned at all (read-only init); we don't warn — only on write-only
        { code: "let x = $state(0); console.log(x);" },
      ],
      invalid: [
        {
          code: `
            let counter = $state(0);
            function inc() { counter++; }
          `,
          errors: [{ messageId: "preferLet" }],
        },
        {
          code: `
            let log = $state([]);
            function record(line) { log.push(line); }
          `,
          errors: [{ messageId: "preferLet" }],
        },
      ],
    });
  });
});

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/no-mutation-of-export-let.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-mutation-of-export-let", () => {
  it("validates fixtures", () => {
    tester.run("no-mutation-of-export-let", rule, {
      valid: [
        { code: "export let name; console.log(name);" },
        { code: "let local = 1; local = 2;" },
        { code: "export let name; let copy = name; copy = 'x';" },
        { code: "export const fixed = 1;" },
      ],
      invalid: [
        {
          code: "export let name; name = 'x';",
          errors: [{ messageId: "mutation" }],
        },
        {
          code: "export let user; user.name = 'x';",
          errors: [{ messageId: "mutation" }],
        },
        {
          code: "export let count; count++;",
          errors: [{ messageId: "mutation" }],
        },
      ],
    });
  });
});

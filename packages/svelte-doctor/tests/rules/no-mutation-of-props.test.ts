import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-mutation-of-props.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-mutation-of-props", () => {
  it("validates fixtures", () => {
    tester.run("no-mutation-of-props", rule, {
      valid: [
        { code: "let { name } = $props(); console.log(name);" },
        { code: "let local = 1; local = 2;" },
        { code: "let { name } = $props(); let local = name; local = 'x';" },
      ],
      invalid: [
        {
          code: "let { name } = $props(); name = 'x';",
          errors: [{ messageId: "mutation" }],
        },
        {
          code: "let props = $props(); props.name = 'x';",
          errors: [{ messageId: "mutation" }],
        },
        {
          code: "let { count } = $props(); count++;",
          errors: [{ messageId: "mutation" }],
        },
      ],
    });
  });
});

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-fetch-in-effect.js";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("no-fetch-in-effect", () => {
  it("validates fixtures", () => {
    tester.run("no-fetch-in-effect", rule, {
      valid: [
        { code: "fetch('/api/foo');" },
        { code: "$effect(() => { console.log('ok'); });" },
        { code: "async function load() { await fetch('/api/foo'); }" },
        {
          code: "$effect(() => () => clearTimeout(timer));",
        },
      ],
      invalid: [
        {
          code: "$effect(() => { fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInEffect" }],
        },
        {
          code: "$effect.pre(() => { fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInEffect" }],
        },
        {
          code: "$effect(async () => { const r = await fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInEffect" }],
        },
      ],
    });
  });
});

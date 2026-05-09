import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/no-fetch-in-onMount.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-fetch-in-onMount", () => {
  it("validates fixtures", () => {
    tester.run("no-fetch-in-onMount", rule, {
      valid: [
        { code: "fetch('/api/foo');" },
        { code: "onMount(() => { console.log('ok'); });" },
        { code: "async function load() { await fetch('/api/foo'); }" },
        { code: "onMount(() => () => clearTimeout(timer));" },
      ],
      invalid: [
        {
          code: "onMount(() => { fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInOnMount" }],
        },
        {
          code: "onMount(async () => { const r = await fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInOnMount" }],
        },
        {
          code: "onMount(() => { axios.get('/api/foo'); });",
          errors: [{ messageId: "fetchInOnMount" }],
        },
      ],
    });
  });
});

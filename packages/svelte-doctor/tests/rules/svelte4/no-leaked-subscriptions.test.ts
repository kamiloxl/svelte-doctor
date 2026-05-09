import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/no-leaked-subscriptions.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-leaked-subscriptions", () => {
  it("validates fixtures", () => {
    tester.run("no-leaked-subscriptions", rule, {
      valid: [
        { code: "onMount(() => { console.log('ok'); });" },
        {
          code: "onMount(() => { const u = store.subscribe(v => {}); return () => u(); });",
        },
        {
          code: "onMount(() => { window.addEventListener('click', h); return () => window.removeEventListener('click', h); });",
        },
      ],
      invalid: [
        {
          code: "onMount(() => { store.subscribe(v => {}); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "onMount(() => { window.addEventListener('click', h); });",
          errors: [{ messageId: "missingCleanup" }],
        },
      ],
    });
  });
});

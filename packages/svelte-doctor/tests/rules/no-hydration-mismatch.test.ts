import { Linter, type Rule } from "eslint";
import svelteParser from "svelte-eslint-parser";
import { describe, expect, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-hydration-mismatch.js";

const linter = new Linter();

function lintSvelte(code: string) {
  return linter.verify(code, {
    languageOptions: {
      parser: svelteParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { local: { rules: { "no-hydration-mismatch": rule as Rule.RuleModule } } },
    rules: { "local/no-hydration-mismatch": "error" },
  });
}

describe("no-hydration-mismatch", () => {
  it("flags new Date() in mustache template", () => {
    const messages = lintSvelte(`<p>{new Date().toISOString()}</p>`);
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("hydrationMismatch");
  });

  it("flags Math.random() in script top-level", () => {
    const messages = lintSvelte(
      `<script>let id = Math.random();</script>`,
    );
    expect(messages).toHaveLength(1);
  });

  it("flags Date.now() at top level", () => {
    const messages = lintSvelte(
      `<script>let now = Date.now();</script><p>{now}</p>`,
    );
    expect(messages).toHaveLength(1);
  });

  it("flags crypto.randomUUID() at top level", () => {
    const messages = lintSvelte(
      `<script>let id = crypto.randomUUID();</script>`,
    );
    expect(messages).toHaveLength(1);
  });

  it("allows Math.random() inside an event handler", () => {
    const messages = lintSvelte(
      `<script>function roll() { return Math.random(); }</script><button onclick={roll}>roll</button>`,
    );
    expect(messages).toHaveLength(0);
  });

  it("allows new Date() inside $effect", () => {
    const messages = lintSvelte(
      `<script>$effect(() => { console.log(new Date()); });</script>`,
    );
    expect(messages).toHaveLength(0);
  });

  it("flags new Date() inside $derived", () => {
    const messages = lintSvelte(
      `<script>let now = $derived(new Date());</script>`,
    );
    expect(messages).toHaveLength(1);
  });
});

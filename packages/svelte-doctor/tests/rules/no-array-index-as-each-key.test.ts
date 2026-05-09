import { Linter } from "eslint";
import svelteParser from "svelte-eslint-parser";
import { describe, expect, it } from "vitest";
import { rule } from "../../src/plugin/rules/performance/no-array-index-as-each-key.js";

const linter = new Linter();

function lint(code: string) {
  return linter.verify(code, {
    languageOptions: {
      parser: svelteParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { local: { rules: { "no-array-index-as-each-key": rule } } },
    rules: { "local/no-array-index-as-each-key": "error" },
  });
}

describe("no-array-index-as-each-key", () => {
  it("flags index used as key", () => {
    const messages = lint(`{#each items as item, i (i)}<x />{/each}`);
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("indexAsKey");
  });

  it("allows stable id as key", () => {
    const messages = lint(`{#each items as item, i (item.id)}<x />{/each}`);
    expect(messages).toHaveLength(0);
  });

  it("ignores each without index", () => {
    const messages = lint(`{#each items as item}<x />{/each}`);
    expect(messages).toHaveLength(0);
  });
});

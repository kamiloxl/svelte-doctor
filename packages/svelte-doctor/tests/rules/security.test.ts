import { Linter, type Rule } from "eslint";
import svelteParser from "svelte-eslint-parser";
import { describe, expect, it } from "vitest";
import { rule as noUnsafeHtml } from "../../src/plugin/rules/security/no-unsafe-html-binding.js";
import { rule as noHrefJs } from "../../src/plugin/rules/security/no-href-javascript.js";

const linter = new Linter();

function lint(code: string, rule: Rule.RuleModule, ruleId: string) {
  return linter.verify(code, {
    languageOptions: {
      parser: svelteParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { local: { rules: { [ruleId]: rule } } },
    rules: { [`local/${ruleId}`]: "error" },
  });
}

describe("no-unsafe-html-binding", () => {
  it("flags raw {@html} with bare identifier", () => {
    const messages = lint(
      `<script>let x = '<b>';</script>{@html x}`,
      noUnsafeHtml,
      "no-unsafe-html-binding",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("unsafeHtml");
  });

  it("allows DOMPurify.sanitize result", () => {
    const messages = lint(
      `<script>import DOMPurify from 'dompurify'; let x = '<b>';</script>{@html DOMPurify.sanitize(x)}`,
      noUnsafeHtml,
      "no-unsafe-html-binding",
    );
    expect(messages).toHaveLength(0);
  });

  it("ignores non-raw mustache tags", () => {
    const messages = lint(
      `<script>let x = 'a';</script>{x}`,
      noUnsafeHtml,
      "no-unsafe-html-binding",
    );
    expect(messages).toHaveLength(0);
  });
});

describe("no-href-javascript", () => {
  it('flags href="javascript:..."', () => {
    const messages = lint(
      `<a href="javascript:void(0)">x</a>`,
      noHrefJs,
      "no-href-javascript",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("hrefJavascript");
  });

  it("ignores normal hrefs", () => {
    const messages = lint(
      `<a href="/about">about</a>`,
      noHrefJs,
      "no-href-javascript",
    );
    expect(messages).toHaveLength(0);
  });
});

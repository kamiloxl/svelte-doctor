import { Linter, type Rule } from "eslint";
import { resolve } from "node:path";
import svelteParser from "svelte-eslint-parser";
import { describe, expect, it } from "vitest";
import { rule as noEval } from "../../src/plugin/rules/security/no-eval.js";
import { rule as noSecretsInClient } from "../../src/plugin/rules/security/no-secrets-in-client.js";
import { rule as noUnsafeTargetBlank } from "../../src/plugin/rules/security/no-unsafe-target-blank.js";
import { rule as noLocalStorageOfSecrets } from "../../src/plugin/rules/security/no-localStorage-of-secrets.js";

const linter = new Linter();

function lintJs(code: string, filename: string, ruleId: string, rule: Rule.RuleModule) {
  return linter.verify(
    code,
    [
      {
        files: ["**/*.{ts,js,mts,cts}"],
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
        plugins: { local: { rules: { [ruleId]: rule } } },
        rules: { [`local/${ruleId}`]: "error" },
      },
    ],
    resolve(process.cwd(), filename),
  );
}

function lintSvelte(code: string, ruleId: string, rule: Rule.RuleModule) {
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

describe("no-eval", () => {
  it("flags eval(...)", () => {
    const messages = lintJs(`eval('1+1');`, "src/lib/x.ts", "no-eval", noEval);
    expect(messages.map((m) => m.messageId)).toContain("noEval");
  });

  it("flags new Function('a','b','return a+b')", () => {
    const messages = lintJs(
      `const f = new Function('a','b','return a+b');`,
      "src/lib/x.ts",
      "no-eval",
      noEval,
    );
    expect(messages.map((m) => m.messageId)).toContain("noFunction");
  });

  it("flags setTimeout('alert(1)', 100)", () => {
    const messages = lintJs(
      `setTimeout('alert(1)', 100);`,
      "src/lib/x.ts",
      "no-eval",
      noEval,
    );
    expect(messages.map((m) => m.messageId)).toContain("noStringTimer");
  });

  it("allows setTimeout(fn, 100)", () => {
    const messages = lintJs(
      `setTimeout(() => alert(1), 100);`,
      "src/lib/x.ts",
      "no-eval",
      noEval,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("no-secrets-in-client", () => {
  const stripeLikeSuffix = "a".repeat(24);

  it("flags Stripe live key in client file", () => {
    const messages = lintJs(
      `const k = 'sk_live_${stripeLikeSuffix}';`,
      "src/lib/x.ts",
      "no-secrets-in-client",
      noSecretsInClient,
    );
    expect(messages.map((m) => m.messageId)).toContain("secretValue");
  });

  it("flags variable named apiKey holding a long string", () => {
    const messages = lintJs(
      `const apiKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';`,
      "src/routes/+page.ts",
      "no-secrets-in-client",
      noSecretsInClient,
    );
    expect(messages.map((m) => m.messageId)).toContain("secretByName");
  });

  it("ignores secrets in *.server.ts files", () => {
    const messages = lintJs(
      `const k = 'sk_live_${stripeLikeSuffix}';`,
      "src/routes/api/+server.ts",
      "no-secrets-in-client",
      noSecretsInClient,
    );
    expect(messages).toHaveLength(0);
  });

  it("ignores allow-listed names like prompt_label", () => {
    const messages = lintJs(
      `const tokenLabel = 'aaaaaaaaaaaaaaaaaaaaaa';`,
      "src/routes/+page.ts",
      "no-secrets-in-client",
      noSecretsInClient,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("no-unsafe-target-blank", () => {
  it("flags <a target=\"_blank\"> without rel", () => {
    const messages = lintSvelte(
      `<a href="https://x" target="_blank">x</a>`,
      "no-unsafe-target-blank",
      noUnsafeTargetBlank,
    );
    expect(messages.map((m) => m.messageId)).toContain("missingRel");
  });

  it("allows target=_blank with full rel", () => {
    const messages = lintSvelte(
      `<a href="https://x" target="_blank" rel="noopener noreferrer">x</a>`,
      "no-unsafe-target-blank",
      noUnsafeTargetBlank,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("no-localStorage-of-secrets", () => {
  it("flags localStorage.setItem('token', ...)", () => {
    const messages = lintJs(
      `localStorage.setItem('token', x);`,
      "src/lib/x.ts",
      "no-localStorage-of-secrets",
      noLocalStorageOfSecrets,
    );
    expect(messages.map((m) => m.messageId)).toContain("secretInStorage");
  });

  it("ignores benign keys", () => {
    const messages = lintJs(
      `localStorage.setItem('theme', 'dark');`,
      "src/lib/x.ts",
      "no-localStorage-of-secrets",
      noLocalStorageOfSecrets,
    );
    expect(messages).toHaveLength(0);
  });
});

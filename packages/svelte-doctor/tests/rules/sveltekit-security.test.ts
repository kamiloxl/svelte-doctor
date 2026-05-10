import { Linter, type Rule } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rule as csrfDisabled } from "../../src/plugin/rules/sveltekit/csrf-disabled-check.js";
import { rule as cookiesHttpOnly } from "../../src/plugin/rules/sveltekit/cookies-without-httponly.js";
import { rule as redirectUntrusted } from "../../src/plugin/rules/sveltekit/no-redirect-from-untrusted-input.js";
import { rule as privateEnvLeak } from "../../src/plugin/rules/security/no-private-env-leak.js";
import { rule as weakCsp } from "../../src/plugin/rules/sveltekit/weak-csp.js";
import { rule as prerender } from "../../src/plugin/rules/sveltekit/prerender-with-user-data.js";

const linter = new Linter();

function lintAt(code: string, filename: string, ruleId: string, rule: Rule.RuleModule) {
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

describe("csrf-disabled-check", () => {
  it("flags checkOrigin: false in svelte.config.js", () => {
    const messages = lintAt(
      `export default { kit: { csrf: { checkOrigin: false } } };`,
      "svelte.config.js",
      "csrf-disabled-check",
      csrfDisabled,
    );
    expect(messages.map((m) => m.messageId)).toContain("csrfDisabled");
  });

  it("ignores in non-config files", () => {
    const messages = lintAt(
      `export default { csrf: { checkOrigin: false } };`,
      "src/lib/x.ts",
      "csrf-disabled-check",
      csrfDisabled,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("cookies-without-httponly", () => {
  it("flags cookies.set('session', v, {}) without httpOnly", () => {
    const messages = lintAt(
      `cookies.set('session', value, { path: '/', sameSite: 'lax' });`,
      "src/routes/+page.server.ts",
      "cookies-without-httponly",
      cookiesHttpOnly,
    );
    expect(messages.map((m) => m.messageId)).toContain("missingHttpOnly");
  });

  it("flags cookies.set with httpOnly: false", () => {
    const messages = lintAt(
      `cookies.set('session', v, { httpOnly: false, secure: true, sameSite: 'lax' });`,
      "src/routes/+page.server.ts",
      "cookies-without-httponly",
      cookiesHttpOnly,
    );
    expect(messages.map((m) => m.messageId)).toContain("explicitInsecure");
  });

  it("flags missing sameSite", () => {
    const messages = lintAt(
      `cookies.set('session', v, { httpOnly: true, secure: true });`,
      "src/routes/+page.server.ts",
      "cookies-without-httponly",
      cookiesHttpOnly,
    );
    expect(messages.map((m) => m.messageId)).toContain("missingSameSite");
  });

  it("ignores non-sensitive cookie names", () => {
    const messages = lintAt(
      `cookies.set('theme', 'dark', { });`,
      "src/routes/+page.server.ts",
      "cookies-without-httponly",
      cookiesHttpOnly,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("no-redirect-from-untrusted-input", () => {
  it("flags redirect with url.searchParams.get(...)", () => {
    const messages = lintAt(
      `redirect(302, url.searchParams.get('next'));`,
      "src/routes/+page.server.ts",
      "no-redirect-from-untrusted-input",
      redirectUntrusted,
    );
    expect(messages.map((m) => m.messageId)).toContain("taintedRedirect");
  });

  it("allows redirect to literal string", () => {
    const messages = lintAt(
      `redirect(302, '/dashboard');`,
      "src/routes/+page.server.ts",
      "no-redirect-from-untrusted-input",
      redirectUntrusted,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("no-private-env-leak", () => {
  it("flags returning a private env value from server load", () => {
    const messages = lintAt(
      `import { SECRET } from '$env/static/private';
export const load = async () => ({ secret: SECRET });`,
      "src/routes/+page.server.ts",
      "no-private-env-leak",
      privateEnvLeak,
    );
    expect(messages.map((m) => m.messageId)).toContain("privateEnvLeak");
  });

  it("allows derived/safe data", () => {
    const messages = lintAt(
      `import { SECRET } from '$env/static/private';
export const load = async () => ({ ok: !!SECRET });`,
      "src/routes/+page.server.ts",
      "no-private-env-leak",
      privateEnvLeak,
    );
    expect(messages).toHaveLength(0);
  });
});

describe("weak-csp", () => {
  it("flags 'unsafe-inline' inside kit.csp directives", () => {
    const messages = lintAt(
      `export default { kit: { csp: { directives: { 'script-src': ['self', 'unsafe-inline'] } } } };`,
      "svelte.config.js",
      "weak-csp",
      weakCsp,
    );
    expect(messages.map((m) => m.messageId)).toContain("weakToken");
  });
});

describe("prerender-with-user-data", () => {
  it("flags reading cookies in a prerendered route", () => {
    const messages = lintAt(
      `export const prerender = true;
export const load = ({ cookies }) => ({ user: cookies.get('user') });`,
      "src/routes/+page.server.ts",
      "prerender-with-user-data",
      prerender,
    );
    expect(messages.map((m) => m.messageId)).toContain("forbiddenAccess");
  });

  it("allows prerendered route with no request data", () => {
    const messages = lintAt(
      `export const prerender = true;
export const load = () => ({ ok: true });`,
      "src/routes/+page.server.ts",
      "prerender-with-user-data",
      prerender,
    );
    expect(messages).toHaveLength(0);
  });
});

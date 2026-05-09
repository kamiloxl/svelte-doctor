import { Linter } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rule } from "../../src/plugin/rules/sveltekit/no-fetch-in-load-without-event.js";

const linter = new Linter();

function lint(code: string, filename: string) {
  return linter.verify(
    code,
    [
      {
        files: ["**/*.{ts,js,svelte,mts,cts}"],
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
        plugins: { local: { rules: { "no-fetch-in-load-without-event": rule } } },
        rules: { "local/no-fetch-in-load-without-event": "error" },
      },
    ],
    resolve(process.cwd(), filename),
  );
}

describe("no-fetch-in-load-without-event", () => {
  it("flags bare fetch in load function", () => {
    const messages = lint(
      `export async function load() { const r = await fetch('/api/x'); return { r }; }`,
      "src/routes/+page.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("bareFetchInLoad");
  });

  it("allows fetch destructured from event", () => {
    const messages = lint(
      `export async function load({ fetch }) { return { r: await fetch('/api/x') }; }`,
      "src/routes/+page.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("ignores files that are not load files", () => {
    const messages = lint(
      `export async function load() { await fetch('/x'); }`,
      "src/lib/util.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("flags arrow load function", () => {
    const messages = lint(
      `export const load = async () => { await fetch('/x'); };`,
      "src/routes/+layout.ts",
    );
    expect(messages).toHaveLength(1);
  });
});

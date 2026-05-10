import { Linter, type Rule } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rule } from "../../src/plugin/rules/sveltekit/no-sequential-await-in-load.js";

const linter = new Linter();

function lint(code: string, filename: string) {
  return linter.verify(
    code,
    [
      {
        files: ["**/*.{ts,js}"],
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
        plugins: {
          local: { rules: { "no-sequential-await-in-load": rule as Rule.RuleModule } },
        },
        rules: { "local/no-sequential-await-in-load": "error" },
      },
    ],
    resolve(process.cwd(), filename),
  );
}

describe("no-sequential-await-in-load", () => {
  it("flags two consecutive awaits with no data dependency", () => {
    const messages = lint(
      `export async function load({ fetch }) {
        const a = await fetch('/api/a');
        const b = await fetch('/api/b');
        return { a, b };
      }`,
      "src/routes/+page.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("sequential");
  });

  it("allows sequential when second uses first result", () => {
    const messages = lint(
      `export async function load({ fetch }) {
        const a = await fetch('/api/a');
        const b = await fetch('/api/b/' + (await a.json()).id);
        return { a, b };
      }`,
      "src/routes/+page.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("flags arrow load function with sequential awaits", () => {
    const messages = lint(
      `export const load = async ({ fetch }) => {
        const x = await fetch('/api/x');
        const y = await fetch('/api/y');
        return { x, y };
      };`,
      "src/routes/+layout.server.ts",
    );
    expect(messages).toHaveLength(1);
  });

  it("ignores files that are not load files", () => {
    const messages = lint(
      `export async function load() {
        const a = await fetch('/x');
        const b = await fetch('/y');
        return { a, b };
      }`,
      "src/lib/util.ts",
    );
    expect(messages).toHaveLength(0);
  });
});

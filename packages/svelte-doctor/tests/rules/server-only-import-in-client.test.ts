import { Linter } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rule } from "../../src/plugin/rules/sveltekit/server-only-import-in-client.js";

const linter = new Linter();

function lint(code: string, filename: string) {
  const absolute = resolve(process.cwd(), filename);
  return linter.verify(
    code,
    [
      {
        files: ["**/*.{ts,js,svelte,mts,cts}"],
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
        plugins: { local: { rules: { "server-only-import-in-client": rule } } },
        rules: { "local/server-only-import-in-client": "error" },
      },
    ],
    absolute,
  );
}

describe("server-only-import-in-client", () => {
  it("flags $lib/server import from client file", () => {
    const messages = lint(
      `import { x } from "$lib/server/secrets";`,
      "src/routes/+page.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("serverOnlyInClient");
  });

  it("flags $env/static/private from client file", () => {
    const messages = lint(
      `import { SECRET } from "$env/static/private";`,
      "src/lib/foo.ts",
    );
    expect(messages).toHaveLength(1);
  });

  it("allows $lib/server import from +page.server.ts", () => {
    const messages = lint(
      `import { x } from "$lib/server/db";`,
      "src/routes/+page.server.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows $lib/server import from +server.ts", () => {
    const messages = lint(
      `import { x } from "$lib/server/db";`,
      "src/routes/api/+server.ts",
    );
    expect(messages).toHaveLength(0);
  });
});

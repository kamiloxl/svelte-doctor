import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, resolveConfig } from "../src/utils/config-loader.js";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "svelte-doctor-cli-cfg-"));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("loadConfig", () => {
  it("reads svelte-doctor-cli.config.json when present", () => {
    writeFileSync(
      join(cwd, "svelte-doctor-cli.config.json"),
      JSON.stringify({ ignore: { rules: ["foo"] }, lint: false }),
    );
    expect(loadConfig(cwd)).toEqual({ ignore: { rules: ["foo"] }, lint: false });
  });

  it("falls back to package.json#svelteDoctor", () => {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "x", svelteDoctor: { failOn: "error" } }),
    );
    expect(loadConfig(cwd)).toEqual({ failOn: "error" });
  });

  it("returns empty object when no config", () => {
    expect(loadConfig(cwd)).toEqual({});
  });
});

describe("resolveConfig", () => {
  it("applies defaults", () => {
    const r = resolveConfig({});
    expect(r.lint).toBe(true);
    expect(r.deadCode).toBe(true);
    expect(r.failOn).toBe("none");
    expect(r.ignore.rules).toEqual([]);
    expect(r.adoptExistingLintConfig).toBe(true);
    expect(r.customRulesOnly).toBe(false);
  });

  it("CLI overrides win over config", () => {
    const r = resolveConfig({ lint: true }, { lint: false });
    expect(r.lint).toBe(false);
  });

  it("preserves provided ignore", () => {
    const r = resolveConfig({ ignore: { rules: ["a"], files: ["x"] } });
    expect(r.ignore.rules).toEqual(["a"]);
    expect(r.ignore.files).toEqual(["x"]);
  });
});

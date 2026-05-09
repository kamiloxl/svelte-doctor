import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findUserEslintConfig } from "../src/utils/user-eslint-config.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sd-cfg-search-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("findUserEslintConfig — ancestor search", () => {
  it("finds eslint.config.js in the same directory", () => {
    writeFileSync(join(root, "eslint.config.js"), "export default [];");
    expect(findUserEslintConfig(root)).toBe(join(root, "eslint.config.js"));
  });

  it("walks up to find eslint.config.js in monorepo root", () => {
    writeFileSync(join(root, "eslint.config.mjs"), "export default [];");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    const subPackage = join(root, "packages", "web");
    mkdirSync(subPackage, { recursive: true });

    expect(findUserEslintConfig(subPackage)).toBe(
      join(root, "eslint.config.mjs"),
    );
  });

  it("stops at .git boundary even if config is further up", () => {
    const homeLike = join(root, "home");
    mkdirSync(homeLike, { recursive: true });
    writeFileSync(join(homeLike, "eslint.config.js"), "export default [];");
    const project = join(homeLike, "project");
    mkdirSync(project, { recursive: true });
    mkdirSync(join(project, ".git"), { recursive: true });
    const subPackage = join(project, "packages", "web");
    mkdirSync(subPackage, { recursive: true });

    expect(findUserEslintConfig(subPackage)).toBeNull();
  });

  it("returns null when no config exists anywhere", () => {
    const subPackage = join(root, "packages", "web");
    mkdirSync(subPackage, { recursive: true });
    expect(findUserEslintConfig(subPackage)).toBeNull();
  });
});

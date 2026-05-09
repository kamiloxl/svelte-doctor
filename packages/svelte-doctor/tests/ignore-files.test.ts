import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  expandToFileAndChildren,
  readIgnoreFiles,
} from "../src/utils/ignore-files.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sd-ignore-files-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("readIgnoreFiles", () => {
  it("reads .gitignore and converts to glob patterns", () => {
    writeFileSync(
      join(root, ".gitignore"),
      [
        "# comment",
        "",
        "node_modules",
        "dist/",
        "/build",
        "*.log",
        "tmp/local",
        "!keep.log",
      ].join("\n"),
    );
    const patterns = readIgnoreFiles(root);
    expect(patterns).toContain("**/node_modules");
    expect(patterns).toContain("**/dist");
    expect(patterns).toContain("build");
    expect(patterns).toContain("**/*.log");
    expect(patterns).toContain("tmp/local");
    expect(patterns).not.toContain("!keep.log");
  });

  it("merges .gitignore + .eslintignore + .prettierignore", () => {
    writeFileSync(join(root, ".gitignore"), "node_modules\n");
    writeFileSync(join(root, ".eslintignore"), "fixtures\n");
    writeFileSync(join(root, ".prettierignore"), "*.snap\n");
    const patterns = readIgnoreFiles(root);
    expect(patterns).toEqual(
      expect.arrayContaining(["**/node_modules", "**/fixtures", "**/*.snap"]),
    );
  });

  it("returns empty array when no ignore files", () => {
    expect(readIgnoreFiles(root)).toEqual([]);
  });
});

describe("expandToFileAndChildren", () => {
  it("expands directory-like patterns to also match contents", () => {
    expect(expandToFileAndChildren(["dist", "**/*.log"])).toEqual(
      expect.arrayContaining(["dist", "dist/**", "**/*.log"]),
    );
  });
});

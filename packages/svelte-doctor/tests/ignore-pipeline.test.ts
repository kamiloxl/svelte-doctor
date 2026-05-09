import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIgnorePipeline } from "../src/utils/ignore-pipeline.js";
import type { Diagnostic } from "../src/types.js";

let root: string;

function makeDiag(relPath: string, ruleId = "svelte-doctor-cli/no-fetch-in-effect"): Diagnostic {
  return {
    ruleId,
    category: "state-effects",
    severity: "error",
    message: "x",
    file: join(root, relPath),
    line: 1,
    column: 1,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sd-ignore-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("ignore pipeline — built-in ignored directories", () => {
  it("drops diagnostics in node_modules / dist / build / coverage / .svelte-kit", () => {
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: [],
      ignoreOverrides: [],
    });
    expect(pipeline.filter(makeDiag("node_modules/lib/x.svelte"))).toBe(false);
    expect(pipeline.filter(makeDiag("dist/x.svelte"))).toBe(false);
    expect(pipeline.filter(makeDiag(".svelte-kit/output/x.js"))).toBe(false);
    expect(pipeline.filter(makeDiag("src/x.svelte"))).toBe(true);
  });
});

describe("ignore pipeline — .gitattributes vendored/generated", () => {
  it("skips files marked linguist-vendored", () => {
    writeFileSync(
      join(root, ".gitattributes"),
      "src/vendor/** linguist-vendored\nsrc/generated/** linguist-generated\n",
    );
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: [],
      ignoreOverrides: [],
    });
    expect(pipeline.filter(makeDiag("src/vendor/lib.svelte"))).toBe(false);
    expect(pipeline.filter(makeDiag("src/generated/api.ts"))).toBe(false);
    expect(pipeline.filter(makeDiag("src/app.svelte"))).toBe(true);
  });

  it("respects later linguist-vendored=false override", () => {
    writeFileSync(
      join(root, ".gitattributes"),
      [
        "src/** linguist-vendored",
        "src/keep/** linguist-vendored=false",
      ].join("\n"),
    );
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: [],
      ignoreOverrides: [],
    });
    expect(pipeline.filter(makeDiag("src/other/x.svelte"))).toBe(false);
    expect(pipeline.filter(makeDiag("src/keep/x.svelte"))).toBe(true);
  });
});

describe("ignore pipeline — config ignore.files", () => {
  it("matches glob patterns", () => {
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: ["src/legacy/**", "**/*.skip.svelte"],
      ignoreOverrides: [],
    });
    expect(pipeline.filter(makeDiag("src/legacy/x.svelte"))).toBe(false);
    expect(pipeline.filter(makeDiag("src/foo/y.skip.svelte"))).toBe(false);
    expect(pipeline.filter(makeDiag("src/foo/y.svelte"))).toBe(true);
  });
});

describe("ignore pipeline — ignore.overrides", () => {
  it("disables specific rules in matching paths", () => {
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: [],
      ignoreOverrides: [
        { files: ["src/legacy/**"], rules: ["svelte-doctor-cli/no-fetch-in-effect"] },
      ],
    });
    expect(pipeline.filter(makeDiag("src/legacy/a.svelte"))).toBe(false);
    expect(
      pipeline.filter(makeDiag("src/legacy/a.svelte", "svelte-doctor-cli/no-href-javascript")),
    ).toBe(true);
    expect(pipeline.filter(makeDiag("src/new/a.svelte"))).toBe(true);
  });

  it("with empty rules list disables every rule on matching paths", () => {
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: [],
      ignoreOverrides: [{ files: ["src/legacy/**"] }],
    });
    expect(
      pipeline.filter(makeDiag("src/legacy/a.svelte", "svelte-doctor-cli/anything")),
    ).toBe(false);
  });

  it("accepts bare rule id without prefix", () => {
    const pipeline = createIgnorePipeline({
      projectRoot: root,
      ignoreFiles: [],
      ignoreOverrides: [
        { files: ["src/**"], rules: ["no-fetch-in-effect"] },
      ],
    });
    expect(pipeline.filter(makeDiag("src/a.svelte"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildJsonErrorReport,
  extractMissingPluginHint,
  formatErrorChain,
  SvelteDoctorError,
} from "../src/utils/error-handling.js";

describe("formatErrorChain", () => {
  it("walks Error.cause chain", () => {
    const inner = new Error("inner failure");
    const middle = new Error("middle failed", { cause: inner });
    const outer = new Error("outer failed", { cause: middle });
    expect(formatErrorChain(outer)).toEqual([
      "outer failed",
      "middle failed",
      "inner failure",
    ]);
  });
});

describe("extractMissingPluginHint", () => {
  it("detects missing eslint plugin and suggests install", () => {
    const err = new Error(`Cannot find package 'eslint-plugin-svelte' imported from /tmp/eslint.config.js`);
    expect(extractMissingPluginHint(err)).toMatch(/pnpm add -D eslint-plugin-svelte/);
  });

  it("returns undefined for unrelated errors", () => {
    const err = new Error("some other failure");
    expect(extractMissingPluginHint(err)).toBeUndefined();
  });

  it("ignores node:* internal modules", () => {
    const err = new Error(`Cannot find module 'node:fs/promises'`);
    expect(extractMissingPluginHint(err)).toBeUndefined();
  });
});

describe("buildJsonErrorReport", () => {
  it("produces structured error with chain and hint", () => {
    const cause = new Error(`Cannot find package 'eslint-plugin-svelte'`);
    const top = new SvelteDoctorError("Failed to load eslint config", { cause });
    const report = buildJsonErrorReport(top);
    expect(report.ok).toBe(false);
    expect(report.error).toBe("Failed to load eslint config");
    expect(report.errorChain).toContain("Cannot find package 'eslint-plugin-svelte'");
    expect(report.hint).toMatch(/pnpm add/);
  });

  it("uses SvelteDoctorError.hint when provided", () => {
    const err = new SvelteDoctorError("custom problem", { hint: "do this thing" });
    const report = buildJsonErrorReport(err);
    expect(report.hint).toBe("do this thing");
  });
});

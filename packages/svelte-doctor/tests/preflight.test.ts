import { describe, expect, it } from "vitest";
import { preflightSvelteProject } from "../src/utils/framework-detection.js";
import type { ProjectInfo } from "../src/types.js";

const baseInfo = (over: Partial<ProjectInfo>): ProjectInfo => ({
  root: "/x",
  framework: "unknown",
  svelteVersion: null,
  svelteMajor: 5,
  svelteVersionSource: "assumed",
  hasTypeScript: false,
  packageManager: "unknown",
  ...over,
});

describe("preflightSvelteProject", () => {
  it("rejects non-Svelte projects with hint", () => {
    const r = preflightSvelteProject(baseInfo({}));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not look like a Svelte project/);
    expect(r.hint).toMatch(/npm create svelte/);
  });

  it("accepts Svelte 4 vite-svelte", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^4.2.0",
        svelteMajor: 4,
        svelteVersionSource: "package.json",
        framework: "vite-svelte",
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("accepts Svelte 5 SvelteKit", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^5.0.0",
        svelteMajor: 5,
        svelteVersionSource: "package.json",
        framework: "sveltekit",
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects Svelte 3 with upgrade hint", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^3.55.0",
        svelteMajor: 5,
        svelteVersionSource: "package.json",
        framework: "vite-svelte",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Svelte 4 and 5/);
  });

  it("rejects Svelte 6 with update hint", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^6.0.0",
        svelteMajor: 5,
        svelteVersionSource: "package.json",
        framework: "vite-svelte",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/svelte-doctor-cli@latest/);
  });

  it("accepts Svelte 5 with unparseable version (workspace tag)", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "workspace:*",
        svelteMajor: 5,
        svelteVersionSource: "node_modules",
        framework: "sveltekit",
      }),
    );
    expect(r.ok).toBe(true);
  });
});

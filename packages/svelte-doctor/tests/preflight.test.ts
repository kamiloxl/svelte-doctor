import { describe, expect, it } from "vitest";
import { preflightSvelteProject } from "../src/utils/framework-detection.js";
import type { ProjectInfo } from "../src/types.js";

const baseInfo = (over: Partial<ProjectInfo>): ProjectInfo => ({
  root: "/x",
  framework: "unknown",
  svelteVersion: null,
  svelteMajor: null,
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

  it("rejects Svelte 4 with upgrade hint", () => {
    const r = preflightSvelteProject(
      baseInfo({ svelteVersion: "^4.2.0", svelteMajor: 4, framework: "vite-svelte" }),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Svelte 5 \(runes\)/);
    expect(r.hint).toMatch(/svelte\^5|svelte@\^5/);
  });

  it("accepts Svelte 5 SvelteKit", () => {
    const r = preflightSvelteProject(
      baseInfo({ svelteVersion: "^5.0.0", svelteMajor: 5, framework: "sveltekit" }),
    );
    expect(r.ok).toBe(true);
  });

  it("accepts Svelte 5 with unparseable version (workspace tag)", () => {
    const r = preflightSvelteProject(
      baseInfo({ svelteVersion: "workspace:*", svelteMajor: null, framework: "sveltekit" }),
    );
    expect(r.ok).toBe(true);
  });
});

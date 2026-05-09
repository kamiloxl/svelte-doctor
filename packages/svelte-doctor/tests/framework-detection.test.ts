import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectProject } from "../src/utils/framework-detection.js";

let cwd: string;

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "svelte-doctor-cli-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("detectProject", () => {
  it("detects SvelteKit + Svelte 5 + pnpm", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "^5.0.0", "@sveltejs/kit": "^2.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    });
    writeFileSync(join(cwd, "pnpm-lock.yaml"), "");
    writeFileSync(join(cwd, "tsconfig.json"), "{}");

    const info = detectProject(cwd);

    expect(info.framework).toBe("sveltekit");
    expect(info.svelteMajor).toBe(5);
    expect(info.svelteVersionSource).toBe("package.json");
    expect(info.packageManager).toBe("pnpm");
    expect(info.hasTypeScript).toBe(true);
  });

  it("detects Svelte 4 from package.json", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "^4.2.0" },
      devDependencies: { vite: "^4.0.0" },
    });

    const info = detectProject(cwd);

    expect(info.svelteMajor).toBe(4);
    expect(info.svelteVersionSource).toBe("package.json");
    expect(info.framework).toBe("vite-svelte");
  });

  it("falls back to node_modules/svelte when version is workspace:*", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "workspace:*" },
    });
    mkdirSync(join(cwd, "node_modules", "svelte"), { recursive: true });
    writeJson(join(cwd, "node_modules", "svelte", "package.json"), {
      name: "svelte",
      version: "4.2.7",
    });

    const info = detectProject(cwd);

    expect(info.svelteMajor).toBe(4);
    expect(info.svelteVersionSource).toBe("node_modules");
  });

  it("assumes Svelte 5 when nothing is resolvable", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "next" },
    });

    const info = detectProject(cwd);

    expect(info.svelteMajor).toBe(5);
    expect(info.svelteVersionSource).toBe("assumed");
  });

  it("respects svelteMajorOverride", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "^5.0.0" },
    });

    const info = detectProject(cwd, { svelteMajorOverride: 4 });

    expect(info.svelteMajor).toBe(4);
    expect(info.svelteVersionSource).toBe("override");
  });

  it("detects Vite + Svelte SPA when svelte+vite present without kit", () => {
    writeJson(join(cwd, "package.json"), {
      devDependencies: { svelte: "^5.0.0", vite: "^5.0.0" },
    });
    writeFileSync(join(cwd, "package-lock.json"), "{}");

    const info = detectProject(cwd);

    expect(info.framework).toBe("vite-svelte");
    expect(info.packageManager).toBe("npm");
  });

  it("returns unknown framework but assumed Svelte 5 when no svelte present", () => {
    writeJson(join(cwd, "package.json"), { dependencies: { react: "^18" } });

    const info = detectProject(cwd);

    expect(info.framework).toBe("unknown");
    expect(info.svelteVersion).toBeNull();
    expect(info.svelteMajor).toBe(5);
    expect(info.svelteVersionSource).toBe("assumed");
  });

  it("throws when root does not exist", () => {
    expect(() => detectProject(join(cwd, "missing"))).toThrow();
  });
});

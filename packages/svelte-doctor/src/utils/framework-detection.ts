import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Framework, ProjectInfo } from "../types.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  packageManager?: string;
}

function readPackageJson(root: string): PackageJsonShape | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonShape;
  } catch {
    return null;
  }
}

function pickVersion(
  pkg: PackageJsonShape | null,
  name: string,
): string | null {
  if (!pkg) return null;
  return (
    pkg.dependencies?.[name] ??
    pkg.devDependencies?.[name] ??
    pkg.peerDependencies?.[name] ??
    null
  );
}

function parseMajor(version: string | null): number | null {
  if (!version) return null;
  const match = version.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function detectFramework(root: string, pkg: PackageJsonShape | null): Framework {
  if (pickVersion(pkg, "@sveltejs/kit")) return "sveltekit";
  if (existsSync(join(root, "svelte.config.js")) && pickVersion(pkg, "svelte")) {
    return "vite-svelte";
  }
  if (pickVersion(pkg, "svelte") && pickVersion(pkg, "vite")) {
    return "vite-svelte";
  }
  return "unknown";
}

function detectPackageManager(
  root: string,
  pkg: PackageJsonShape | null,
): ProjectInfo["packageManager"] {
  if (pkg?.packageManager) {
    if (pkg.packageManager.startsWith("pnpm")) return "pnpm";
    if (pkg.packageManager.startsWith("yarn")) return "yarn";
    if (pkg.packageManager.startsWith("npm")) return "npm";
    if (pkg.packageManager.startsWith("bun")) return "bun";
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

function hasTypeScript(root: string, pkg: PackageJsonShape | null): boolean {
  if (existsSync(join(root, "tsconfig.json"))) return true;
  return Boolean(pickVersion(pkg, "typescript"));
}

export function detectProject(rootInput: string): ProjectInfo {
  const root = resolve(rootInput);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Project root does not exist or is not a directory: ${root}`);
  }
  const pkg = readPackageJson(root);
  const svelteVersion = pickVersion(pkg, "svelte");
  return {
    root,
    framework: detectFramework(root, pkg),
    svelteVersion,
    svelteMajor: parseMajor(svelteVersion),
    hasTypeScript: hasTypeScript(root, pkg),
    packageManager: detectPackageManager(root, pkg),
  };
}

export interface PreflightResult {
  ok: boolean;
  reason?: string;
  hint?: string;
}

export function preflightSvelteProject(project: ProjectInfo): PreflightResult {
  if (!project.svelteVersion && project.framework === "unknown") {
    return {
      ok: false,
      reason:
        "This directory does not look like a Svelte project — no `svelte` dependency found in package.json.",
      hint: "Run svelte-doctor from your Svelte project root, or create a Svelte app first (e.g. `npm create svelte@latest`).",
    };
  }
  if (project.svelteMajor !== null && project.svelteMajor < 5) {
    return {
      ok: false,
      reason: `Detected Svelte ${project.svelteVersion} — svelte-doctor targets Svelte 5 (runes).`,
      hint: "Upgrade to Svelte 5 (`pnpm add svelte@^5`) or wait for legacy Svelte 4 support.",
    };
  }
  return { ok: true };
}

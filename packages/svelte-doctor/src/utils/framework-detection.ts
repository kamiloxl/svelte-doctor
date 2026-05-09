import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Framework, ProjectInfo, SvelteMajor, SvelteVersionSource } from "../types.js";

export interface DetectProjectOptions {
  svelteMajorOverride?: SvelteMajor;
}

interface ResolvedSvelteMajor {
  major: SvelteMajor;
  source: SvelteVersionSource;
}

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

function readNodeModulesSvelteMajor(root: string): number | null {
  const path = join(root, "node_modules", "svelte", "package.json");
  if (!existsSync(path)) return null;
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
    return parseMajor(pkg.version ?? null);
  } catch {
    return null;
  }
}

function resolveSvelteMajor(
  root: string,
  pkg: PackageJsonShape | null,
  override?: SvelteMajor,
): ResolvedSvelteMajor {
  if (override === 4 || override === 5) {
    return { major: override, source: "override" };
  }
  const fromPkg = parseMajor(pickVersion(pkg, "svelte"));
  if (fromPkg === 4 || fromPkg === 5) {
    return { major: fromPkg, source: "package.json" };
  }
  const fromNm = readNodeModulesSvelteMajor(root);
  if (fromNm === 4 || fromNm === 5) {
    return { major: fromNm, source: "node_modules" };
  }
  return { major: 5, source: "assumed" };
}

export function detectProject(
  rootInput: string,
  options: DetectProjectOptions = {},
): ProjectInfo {
  const root = resolve(rootInput);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Project root does not exist or is not a directory: ${root}`);
  }
  const pkg = readPackageJson(root);
  const svelteVersion = pickVersion(pkg, "svelte");
  const { major, source } = resolveSvelteMajor(
    root,
    pkg,
    options.svelteMajorOverride,
  );
  return {
    root,
    framework: detectFramework(root, pkg),
    svelteVersion,
    svelteMajor: major,
    svelteVersionSource: source,
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
  const noSvelte = !project.svelteVersion && project.framework === "unknown";
  if (noSvelte) {
    return {
      ok: false,
      reason:
        "This directory does not look like a Svelte project — no `svelte` dependency found in package.json.",
      hint: "Run svelte-doctor-cli from your Svelte project root, or create a Svelte app first (e.g. `npm create svelte@latest`).",
    };
  }
  const parsed = parseMajor(project.svelteVersion);
  if (parsed !== null && parsed < 4) {
    return {
      ok: false,
      reason: `Detected Svelte ${project.svelteVersion} — svelte-doctor supports Svelte 4 and 5.`,
      hint: "Upgrade to Svelte 4 or 5.",
    };
  }
  if (parsed !== null && parsed > 5) {
    return {
      ok: false,
      reason: `Detected Svelte ${project.svelteVersion} — newer than supported (4, 5).`,
      hint: "Update svelte-doctor: pnpm add -D svelte-doctor-cli@latest.",
    };
  }
  return { ok: true };
}

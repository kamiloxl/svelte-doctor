import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import type { Linter } from "eslint";
import { PROJECT_BOUNDARY_MARKERS } from "../constants.js";

const FLAT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
];

function findInDirectory(dir: string): string | null {
  for (const name of FLAT_CONFIG_FILES) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isProjectBoundary(dir: string): boolean {
  return PROJECT_BOUNDARY_MARKERS.some((marker) =>
    existsSync(join(dir, marker)),
  );
}

export function findUserEslintConfig(root: string): string | null {
  const inRoot = findInDirectory(root);
  if (inRoot) return inRoot;
  if (isProjectBoundary(root)) return null;
  let current = dirname(root);
  while (current && current !== dirname(current)) {
    const found = findInDirectory(current);
    if (found) return found;
    if (isProjectBoundary(current)) return null;
    current = dirname(current);
  }
  return null;
}

export async function loadUserEslintConfig(
  configPath: string,
): Promise<Linter.Config[] | null> {
  try {
    const url = pathToFileURL(configPath).href;
    const mod = (await import(url)) as { default?: unknown };
    const exported = mod.default ?? null;
    if (!exported) return null;
    if (Array.isArray(exported)) return exported as Linter.Config[];
    return [exported as Linter.Config];
  } catch {
    return null;
  }
}

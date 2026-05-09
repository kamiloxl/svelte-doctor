import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [".gitignore", ".eslintignore", ".prettierignore"];

/** Read .gitignore-style files at root and return their patterns. Comments (#) and blank lines are stripped. */
export function readIgnoreFiles(root: string): string[] {
  const all: string[] = [];
  for (const name of FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/^\s+|\s+$/g, "");
      if (!line || line.startsWith("#")) continue;
      // Negation patterns (`!foo`) are not honored — too risky to invert blindly.
      if (line.startsWith("!")) continue;
      all.push(toGlobPattern(line));
    }
  }
  return all;
}

/**
 * Convert a `.gitignore`-style pattern to a glob pattern that minimatch understands.
 *
 * Rules implemented (subset, sufficient for typical project ignores):
 * - `foo`             → `**\/foo` and `**\/foo/**` (anywhere in tree)
 * - `/foo`            → `foo` and `foo/**` (rooted)
 * - `foo/`            → `**\/foo/**` (directory only — we treat as "everything inside")
 * - `*.log`           → `**\/*.log`
 * - paths with `/` other than leading slash are kept relative to root.
 */
function toGlobPattern(pattern: string): string {
  let p = pattern;
  let rooted = false;
  if (p.startsWith("/")) {
    rooted = true;
    p = p.slice(1);
  }
  p = p.replace(/\/$/, "");
  if (rooted) return p;
  if (!p.includes("/")) return `**/${p}`;
  return p;
}

/** For each pattern, also yield the "/**" expansion so directory ignores cover children. */
export function expandToFileAndChildren(patterns: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of patterns) {
    out.add(p);
    if (!p.endsWith("/**") && !p.endsWith("**")) {
      out.add(`${p}/**`);
    }
  }
  return [...out];
}

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export interface GitDiffOptions {
  base?: string;
  staged?: boolean;
}

const TRACKED_EXTENSIONS = new Set([
  ".svelte",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

function gitArgs(options: GitDiffOptions): string[] {
  if (options.staged) return ["diff", "--name-only", "--cached"];
  const base = options.base ?? "HEAD";
  return ["diff", "--name-only", `${base}...HEAD`];
}

export function getChangedFiles(
  root: string,
  options: GitDiffOptions,
): string[] | null {
  try {
    const stdout = execFileSync("git", gitArgs(options), {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => {
        const dot = line.lastIndexOf(".");
        if (dot < 0) return false;
        return TRACKED_EXTENSIONS.has(line.slice(dot));
      })
      .map((line) => resolve(root, line));
  } catch {
    return null;
  }
}

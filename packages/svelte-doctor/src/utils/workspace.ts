import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { glob } from "node:fs/promises";

export interface WorkspaceProject {
  name: string;
  root: string;
}

interface PackageJsonShape {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
}

interface PnpmWorkspaceShape {
  packages?: string[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function readPnpmWorkspace(root: string): string[] {
  const yamlPath = join(root, "pnpm-workspace.yaml");
  if (!existsSync(yamlPath)) return [];
  const text = readFileSync(yamlPath, "utf8");
  const packages: string[] = [];
  let inPackages = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (/^packages:\s*$/.test(line.trim())) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^\s*-\s+["']?([^"'\s]+)["']?\s*$/);
      if (match) {
        packages.push(match[1]);
      } else if (line.trim() && !line.startsWith(" ") && !line.startsWith("\t")) {
        inPackages = false;
      }
    }
  }
  return packages;
}

function workspacePatterns(root: string): string[] {
  const pnpmPatterns = readPnpmWorkspace(root);
  if (pnpmPatterns.length) return pnpmPatterns;
  const pkg = readJson<PackageJsonShape>(join(root, "package.json"));
  if (!pkg?.workspaces) return [];
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
  return pkg.workspaces.packages ?? [];
}

async function expandPattern(root: string, pattern: string): Promise<string[]> {
  const matches: string[] = [];
  for await (const entry of glob(pattern, { cwd: root })) {
    matches.push(resolve(root, entry));
  }
  return matches;
}

export async function discoverWorkspaceProjects(
  root: string,
): Promise<WorkspaceProject[]> {
  const patterns = workspacePatterns(root);
  if (!patterns.length) return [];
  const out: WorkspaceProject[] = [];
  for (const pattern of patterns) {
    for (const dir of await expandPattern(root, pattern)) {
      const pkg = readJson<PackageJsonShape>(join(dir, "package.json"));
      if (!pkg) continue;
      out.push({ name: pkg.name ?? dir, root: dir });
    }
  }
  return out;
}

export async function selectProjects(
  root: string,
  filter: string | undefined,
): Promise<WorkspaceProject[]> {
  const all = await discoverWorkspaceProjects(root);
  if (!all.length) return [];
  if (!filter) return all;
  const wanted = new Set(filter.split(",").map((s) => s.trim()));
  return all.filter((p) => wanted.has(p.name));
}

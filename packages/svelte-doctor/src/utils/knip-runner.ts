import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Diagnostic } from "../types.js";

interface KnipIssueItem {
  name: string;
  line?: number;
  col?: number;
  pos?: number;
}

interface KnipIssueEntry {
  file: string;
  files?: KnipIssueItem[];
  dependencies?: KnipIssueItem[];
  devDependencies?: KnipIssueItem[];
  unlisted?: KnipIssueItem[];
  unresolved?: KnipIssueItem[];
  exports?: KnipIssueItem[];
  types?: KnipIssueItem[];
  duplicates?: KnipIssueItem[];
  enumMembers?: KnipIssueItem[];
  classMembers?: KnipIssueItem[];
  binaries?: KnipIssueItem[];
}

interface KnipJsonReport {
  issues?: KnipIssueEntry[];
}

function resolveKnipBin(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("knip");
  return resolve(entry, "..", "..", "bin", "knip.js");
}

function runKnipProcess(root: string): Promise<string> {
  return new Promise((resolvePromise) => {
    const bin = resolveKnipBin();
    const child = spawn(process.execPath, [bin, "--reporter", "json", "--no-progress"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolvePromise(""));
    child.on("close", () => resolvePromise(stdout));
  });
}

function parseKnipReport(stdout: string): KnipJsonReport | null {
  if (!stdout.trim()) return null;
  try {
    return JSON.parse(stdout) as KnipJsonReport;
  } catch {
    return null;
  }
}

export async function runKnip(root: string): Promise<Diagnostic[]> {
  const stdout = await runKnipProcess(root);
  const report = parseKnipReport(stdout);
  if (!report) return [];

  const diagnostics: Diagnostic[] = [];
  const KIND_LABEL: Record<string, { ruleId: string; label: string }> = {
    files: { ruleId: "unused-file", label: "Unused file" },
    dependencies: { ruleId: "unused-dependency", label: "Unused dependency" },
    devDependencies: {
      ruleId: "unused-dev-dependency",
      label: "Unused devDependency",
    },
    unlisted: { ruleId: "unlisted-dependency", label: "Unlisted dependency" },
    unresolved: { ruleId: "unresolved-import", label: "Unresolved import" },
    exports: { ruleId: "unused-export", label: "Unused export" },
    types: { ruleId: "unused-type", label: "Unused type export" },
    duplicates: { ruleId: "duplicate-export", label: "Duplicate export" },
    enumMembers: { ruleId: "unused-enum-member", label: "Unused enum member" },
    classMembers: {
      ruleId: "unused-class-member",
      label: "Unused class member",
    },
    binaries: { ruleId: "unused-binary", label: "Unused binary" },
  };

  for (const entry of report.issues ?? []) {
    const absolute = resolve(root, entry.file);
    for (const [kind, info] of Object.entries(KIND_LABEL)) {
      const items = (entry as unknown as Record<string, KnipIssueItem[] | undefined>)[kind];
      if (!items?.length) continue;
      for (const issue of items) {
        diagnostics.push({
          ruleId: `svelte-doctor-cli/${info.ruleId}`,
          category: "dead-code",
          severity: "warning",
          message: `${info.label}: ${issue.name}`,
          file: absolute,
          line: issue.line ?? 1,
          column: issue.col ?? 1,
        });
      }
    }
  }

  return diagnostics;
}

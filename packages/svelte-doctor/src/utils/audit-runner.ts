import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Diagnostic } from "../types.js";

const RULE_ID = "svelte-doctor-cli/dependency-vulnerability";
const SEVERITY_TO_DIAGNOSTIC: Record<string, Diagnostic["severity"]> = {
  critical: "error",
  high: "error",
  moderate: "warning",
  low: "warning",
  info: "info",
};

interface NpmAuditAdvisory {
  module_name?: string;
  title?: string;
  severity?: string;
  url?: string;
  via?: Array<string | { source?: number; title?: string; url?: string; severity?: string }>;
  range?: string;
}

interface NpmAuditReport {
  vulnerabilities?: Record<
    string,
    {
      severity?: string;
      via?: Array<string | NpmAuditAdvisory>;
      range?: string;
      effects?: string[];
    }
  >;
}

export interface AuditRunOptions {
  packageManager: string;
  cwd: string;
  /** Bail out and return [] if no manifest is found. */
  skipIfNoManifest?: boolean;
}

function detectAuditCommand(packageManager: string): {
  cmd: string;
  args: string[];
} | null {
  if (packageManager === "pnpm") {
    return { cmd: "pnpm", args: ["audit", "--json"] };
  }
  if (packageManager === "yarn") {
    return { cmd: "yarn", args: ["npm", "audit", "--json"] };
  }
  if (packageManager === "bun") {
    return null;
  }
  return { cmd: "npm", args: ["audit", "--json"] };
}

function execAudit(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve({ stdout, stderr, code: -1 }));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

function viaToTitle(
  via: NonNullable<NpmAuditReport["vulnerabilities"]>[string]["via"],
): string {
  if (!via || !via.length) return "Vulnerable dependency";
  const first = via[0];
  if (typeof first === "string") return first;
  return first.title ?? "Vulnerable dependency";
}

function viaToUrl(
  via: NonNullable<NpmAuditReport["vulnerabilities"]>[string]["via"],
): string | undefined {
  if (!via || !via.length) return undefined;
  const first = via[0];
  if (typeof first === "string") return undefined;
  return first.url;
}

function manifestPath(cwd: string): string {
  return join(cwd, "package.json");
}

export async function runNpmAudit(
  options: AuditRunOptions,
): Promise<Diagnostic[]> {
  if (options.skipIfNoManifest && !existsSync(manifestPath(options.cwd))) {
    return [];
  }
  const cmd = detectAuditCommand(options.packageManager);
  if (!cmd) return [];
  const { stdout } = await execAudit(cmd.cmd, cmd.args, options.cwd);
  if (!stdout.trim()) return [];

  let parsed: NpmAuditReport;
  try {
    parsed = JSON.parse(stdout) as NpmAuditReport;
  } catch {
    return [];
  }
  const vulns = parsed.vulnerabilities;
  if (!vulns) return [];

  const out: Diagnostic[] = [];
  const manifest = manifestPath(options.cwd);
  for (const [pkg, info] of Object.entries(vulns)) {
    const sev = (info.severity ?? "info").toLowerCase();
    const severity: Diagnostic["severity"] =
      SEVERITY_TO_DIAGNOSTIC[sev] ?? "info";
    const title = viaToTitle(info.via);
    const url = viaToUrl(info.via);
    const range = info.range ? ` (${info.range})` : "";
    const message = `${pkg}${range}: ${title}${url ? ` — ${url}` : ""}`;
    out.push({
      ruleId: RULE_ID,
      category: "security",
      severity,
      message,
      file: manifest,
      line: 1,
      column: 1,
    });
  }
  return out;
}

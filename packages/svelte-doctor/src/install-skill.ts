import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { homedir } from "node:os";
import pc from "picocolors";

interface AgentTarget {
  id: string;
  displayName: string;
  /** Path relative to project root (or HOME). */
  path: string;
  /** Whether the path is anchored at HOME (~) or project root. */
  anchor: "home" | "project";
  /** Optional CLI binaries on PATH that signal this agent is installed. */
  binaries?: string[];
}

const AGENT_TARGETS: AgentTarget[] = [
  { id: "claude", displayName: "Claude Code (project)", path: ".claude/skills/svelte-doctor", anchor: "project", binaries: ["claude"] },
  { id: "claude-user", displayName: "Claude Code (user)", path: ".claude/skills/svelte-doctor", anchor: "home", binaries: ["claude"] },
  { id: "cursor", displayName: "Cursor (rules)", path: ".cursor/rules", anchor: "project", binaries: ["cursor"] },
  { id: "codex", displayName: "Codex (AGENTS.md)", path: "AGENTS.md", anchor: "project", binaries: ["codex"] },
  { id: "windsurf", displayName: "Windsurf (rules)", path: ".windsurf/rules", anchor: "project", binaries: ["windsurf"] },
  { id: "copilot", displayName: "GitHub Copilot (instructions)", path: ".github/copilot-instructions.md", anchor: "project", binaries: ["gh", "copilot"] },
  { id: "opencode", displayName: "OpenCode (AGENTS.md)", path: "AGENTS.md", anchor: "project", binaries: ["opencode"] },
];

const PATH_DIRS = (process.env.PATH ?? "").split(delimiter).filter(Boolean);

function isOnPath(binaryName: string): boolean {
  for (const dir of PATH_DIRS) {
    const candidate = join(dir, binaryName);
    if (existsSync(candidate)) return true;
    if (process.platform === "win32" && existsSync(`${candidate}.exe`)) return true;
  }
  return false;
}

const SKILL_BODY = `---
name: svelte-doctor
description: Use after editing Svelte/SvelteKit code, before committing, or when cleaning up a codebase. Surfaces state/effect bugs, security issues, performance traps, and dead code with a 0–100 health score.
version: "1.0.0"
---

# svelte-doctor

Diagnoses Svelte 5 codebases. Outputs a 0–100 health score plus actionable diagnostics across state-effects, performance, security, accessibility, architecture, and dead code.

## After making Svelte/SvelteKit changes

Run \`npx -y svelte-doctor@latest . --diff\` and confirm the score did not regress.

If the score dropped, fix the regressions before committing.

## For broader cleanup

Run \`npx -y svelte-doctor@latest . --verbose\` (no \`--diff\`) for the full codebase. Fix errors first, then warnings.

## Reference

| Flag | Purpose |
| ---- | ------- |
| \`--diff [base]\` | Scan only files changed vs base branch |
| \`--staged\` | Scan only staged files (pre-commit hooks) |
| \`--verbose\` | Show every rule and per-file detail |
| \`--score\` | Output only the numeric score |
| \`--json\` | Structured JSON report |
| \`--explain <file:line>\` | Diagnose why a rule fired |

## Common diagnostics and fixes

- **\`no-fetch-in-effect\`** → move the fetch into a SvelteKit \`load\` function or \`{#await}\`.
- **\`prefer-derived-over-effect\`** → replace \`$effect\` that only assigns state with \`$derived(...)\`.
- **\`no-mutation-of-props\`** → values from \`$props()\` are read-only; lift state up or accept a callback prop.
- **\`no-effect-without-cleanup\`** → \`$effect\` registering listeners/timers must \`return () => …\` to clean them up.
- **\`no-unsafe-html-binding\`** → only pass sanitized strings to \`{@html …}\` (e.g. via DOMPurify).
- **\`server-only-import-in-client\`** → move the import into \`+page.server.ts\`/\`+server.ts\`/\`+layout.server.ts\` or \`hooks.server.ts\`.
- **\`no-fetch-in-load-without-event\`** → use \`event.fetch\` (destructure \`{ fetch }\`) inside SvelteKit load functions.

## Suppressing one site

\`\`\`svelte
<script>
  // svelte-doctor-disable-next-line svelte-doctor/no-fetch-in-effect
  $effect(() => fetch('/api/foo'));
</script>

<!-- svelte-doctor-disable-next-line svelte-doctor/no-unsafe-html-binding -->
{@html trusted}
\`\`\`
`;

interface InstallOptions {
  yes?: boolean;
  dryRun?: boolean;
  root?: string;
}

function detectAvailableAgents(projectRoot: string): AgentTarget[] {
  const detected: AgentTarget[] = [];
  for (const target of AGENT_TARGETS) {
    const anchorRoot = target.anchor === "home" ? homedir() : projectRoot;
    const candidate = resolve(anchorRoot, target.path);
    const fsHit =
      existsSync(candidate) ||
      existsSync(resolve(anchorRoot, target.path.split("/")[0]));
    const binaryHit = target.binaries?.some((b) => isOnPath(b)) ?? false;
    if (fsHit || binaryHit) {
      detected.push(target);
    }
  }
  return detected;
}

function isDirectoryTarget(target: AgentTarget): boolean {
  return !target.path.endsWith(".md");
}

function writeSkill(target: AgentTarget, projectRoot: string): string {
  const anchorRoot = target.anchor === "home" ? homedir() : projectRoot;
  const targetPath = resolve(anchorRoot, target.path);
  if (isDirectoryTarget(target)) {
    mkdirSync(targetPath, { recursive: true });
    const file = join(targetPath, "SKILL.md");
    writeFileSync(file, SKILL_BODY);
    return file;
  }
  mkdirSync(resolve(targetPath, ".."), { recursive: true });
  writeFileSync(targetPath, SKILL_BODY);
  return targetPath;
}

function homePath(target: AgentTarget): string {
  return target.anchor === "home" ? "~" : ".";
}

export async function runInstallSkill(options: InstallOptions = {}): Promise<void> {
  const projectRoot = options.root ? resolve(options.root) : process.cwd();
  const detected = detectAvailableAgents(projectRoot);

  if (!detected.length) {
    process.stdout.write(
      `${pc.yellow("No supported AI coding agents detected.")}\n`,
    );
    process.stdout.write(
      pc.dim(
        `  Looked for: .claude, ~/.claude, .cursor, AGENTS.md, .windsurf, .github/copilot-instructions.md\n`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (options.dryRun) {
    process.stdout.write(`Would install svelte-doctor skill for:\n`);
    for (const t of detected) {
      process.stdout.write(
        `  - ${t.displayName} → ${homePath(t)}/${t.path}\n`,
      );
    }
    return;
  }

  const written: string[] = [];
  for (const t of detected) {
    written.push(writeSkill(t, projectRoot));
  }
  process.stdout.write(
    `${pc.green("✓")} Installed svelte-doctor skill in ${written.length} location${written.length === 1 ? "" : "s"}:\n`,
  );
  for (const path of written) {
    process.stdout.write(`  ${pc.dim(path)}\n`);
  }
}

export const _internal = {
  AGENT_TARGETS,
  SKILL_BODY,
  detectAvailableAgents,
  homePath,
  isDirectoryTarget,
  readdirSync,
  statSync,
};

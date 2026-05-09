# svelte-doctor-cli

```
 ____  __     __ _____ _   _____ _____      ____   ___   ____ _____ ___  ____
/ ___| \ \   / /| ____| | |_   _| ____|    |  _ \ / _ \ / ___|_   _/ _ \|  _ \
\___ \  \ \ / / |  _| | |   | | |  _|      | | | | | | | |     | || | | | |_) |
 ___) |  \ V /  | |___| |___| | | |___     | |_| | |_| | |___  | || |_| |  _ <
|____/    \_/   |_____|_____|_| |_____|    |____/ \___/ \____| |_| \___/|_| \_\
```

Your agent writes bad Svelte. This catches it.

One command scans your codebase and outputs a **0–100 health score** with actionable diagnostics across state & effects, performance, architecture, security, accessibility, and dead code. Works with **Svelte 5 (runes)** in **SvelteKit** and **Vite + Svelte** projects.

## Install

```bash
npx -y svelte-doctor-cli-cli@latest .
```

You'll get a score (75+ Great, 50–74 Needs work, under 50 Critical) and a list of issues. Rules toggle automatically based on detected framework.

## Install for your coding agent

```bash
npx -y svelte-doctor-cli-cli@latest install
```

Detects Claude Code, Cursor, Codex, Windsurf, Copilot or OpenCode and installs a skill that teaches the agent to run `svelte-doctor-cli . --diff` after every edit.

## Configuration

Drop `svelte-doctor-cli.config.json` in your project root, or add a `"svelteDoctor"` key to `package.json`:

```json
{
  "ignore": {
    "rules": ["svelte-doctor-cli/component-too-large"],
    "files": ["src/generated/**"],
    "overrides": [
      {
        "files": ["src/legacy/**"],
        "rules": ["svelte-doctor-cli/no-mutation-of-props"]
      }
    ]
  }
}
```

Honors `.gitignore`, `.gitattributes` (`linguist-vendored` / `linguist-generated`), and built-in ignored directories (`node_modules`, `dist`, `build`, `.svelte-kit`, etc.). Adopts your existing `eslint.config.js` from the project root or any ancestor up to the monorepo boundary.

### Inline suppressions

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-effect
  $effect(() => fetch('/api/foo'));
</script>

<!-- svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-unsafe-html-binding -->
{@html trusted}
```

Stacked comments and multi-line opening tags work as expected. If a suppression is misplaced, svelte-doctor-cli prints a hint inline or via `--explain`.

## ESLint plugin

```js
// eslint.config.js
import svelteDoctor from "svelte-doctor-cli-cli/eslint-plugin";

export default [
  svelteDoctor.configs.recommended,
  svelteDoctor.configs.sveltekit,
];
```

## CLI

```
Usage: svelte-doctor-cli [directory] [options]

  -v, --version              display the version number
  --no-lint                  skip linting
  --no-dead-code             skip dead code detection
  --verbose                  show every rule and per-file detail
  --score                    output only the score
  --json                     output a structured JSON report
  --json-compact             with --json, emit compact JSON
  --diff [base]              scan only files changed vs base branch
  --staged                   scan only staged files (pre-commit hooks)
  --project <name>           select workspace project (comma-separated)
  --fail-on <level>          exit with error: error, warning, none (default: error)
  --annotations              output as GitHub Actions annotations
  --explain <file:line>      diagnose why a rule fired
  --why <file:line>          alias for --explain
  --watch                    re-scan whenever a tracked file changes
```

Subcommand: `install` — install the skill for AI coding agents.

## Node.js API

```ts
import { diagnose, toJsonReport } from "svelte-doctor-cli-cli/api";

const result = await diagnose("./");
console.log(result.score);       // { score: 82, label: "Great" }
console.log(result.diagnostics); // Diagnostic[]
console.log(result.mode);        // "full" | "diff" | "staged"

const report = toJsonReport(result);
```

## Rules

| Rule                                      | Category       | Default |
| ----------------------------------------- | -------------- | ------- |
| `no-fetch-in-effect`                      | state-effects  | error   |
| `prefer-derived-over-effect`              | state-effects  | warn    |
| `no-mutation-of-props`                    | state-effects  | error   |
| `no-effect-without-cleanup`               | state-effects  | warn    |
| `no-cascading-state-in-effect`            | state-effects  | warn    |
| `no-circular-reactivity`                  | state-effects  | warn    |
| `no-array-index-as-each-key`              | performance    | warn    |
| `no-unsafe-html-binding`                  | security       | error   |
| `no-href-javascript`                      | security       | error   |
| `component-too-large`                     | architecture   | warn    |
| `server-only-import-in-client` (SvelteKit) | security      | error   |
| `no-fetch-in-load-without-event` (SvelteKit) | performance | error   |
| `unused-disable-directive`                | meta           | warn    |

Full rule docs: [`docs/rules/`](./docs/rules/).

## How the score is calculated

```
score = 100 − (errorRules × 1.5 + warningRules × 0.75)
```

Penalty is per **unique rule**, not per diagnostic.

## License

MIT.

Have fun :)

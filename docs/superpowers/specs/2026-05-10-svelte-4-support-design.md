# Svelte 4 Support — Design

**Date:** 2026-05-10
**Status:** Approved (pending implementation plan)

## Goal

Extend `svelte-doctor-cli` from Svelte-5-only to support both **Svelte 4** and **Svelte 5** projects, with deterministic version detection, per-version rule sets, and a CLI override.

Today the tool detects `svelteMajor` but `preflightSvelteProject` rejects anything below 5. Universal rules (security, performance, architecture, SvelteKit) already work on both versions; the rune-specific rules (`$effect`, `$state`, `$props`, `$derived`) do not apply to Svelte 4. We add a parallel set of legacy-syntax rules and select the right config from the detected major.

## Non-goals

- Mixed-runes/legacy projects (e.g. Svelte 5 file with `<svelte:options runes={false}>`).
- Migration assistant ("rewrite this in runes").
- Filtering the interactive scope prompt by project version (separate follow-up).

## Architecture

### Version detection (`utils/framework-detection.ts`)

`ProjectInfo.svelteMajor` becomes non-nullable: `4 | 5`. A new field `svelteVersionSource` describes how the value was obtained.

Resolution order:

1. **CLI override** — `--svelte-version 4|5` passed through `detectProject(rootInput, { svelteVersionOverride })`. Source: `"override"`.
2. **`package.json`** — parse first numeric in `dependencies/devDependencies/peerDependencies.svelte`. If parses to 4 or 5, use it. Source: `"package.json"`.
3. **`node_modules/svelte/package.json`** — read `version` from the resolved package, parse major. Used when (2) yields a non-numeric like `workspace:*`, `git+https://...`, `next`. Source: `"node_modules"`.
4. **Fallback** — assume `5`. Source: `"assumed"`. Banner shows `Svelte 5 (assumed — could not detect)`.

`preflightSvelteProject`:
- Project is not Svelte (no `svelte` dep, framework `unknown`) → reject as today.
- `svelteMajor < 4` → reject: `Detected Svelte ${ver} — svelte-doctor supports Svelte 4 and 5.`
- `svelteMajor > 5` → reject: `Detected Svelte ${ver} — newer than supported (4, 5). Update svelte-doctor: pnpm add -D svelte-doctor-cli@latest.`
- `svelteMajor` is 4 or 5 → accept.

### Rule organization

```
src/plugin/rules/
  svelte4/                          ← NEW
    no-fetch-in-onMount.ts
    no-mutation-of-export-let.ts
    prefer-reactive-statement.ts
    no-leaked-subscriptions.ts
  svelte5/                          ← unchanged
  sveltekit/                        ← unchanged, runs on both majors
  performance/                      ← unchanged, runs on both majors
  security/                         ← unchanged, runs on both majors
  architecture/                     ← unchanged, runs on both majors
```

All rules remain registered in a single `plugin.rules` map so inline disables work uniformly across configs.

### ESLint configs (`eslint-plugin.ts`)

Four presets:

| Preset              | Composition                                                              |
|---------------------|--------------------------------------------------------------------------|
| `recommended`       | svelte5 rules + universal rules                                          |
| `sveltekit`         | `recommended` + sveltekit rules                                          |
| `svelte4`           | svelte4 rules + universal rules                                          |
| `svelte4-sveltekit` | `svelte4` + sveltekit rules                                              |

Selection table in `scan.ts → buildEslint`:

| svelteMajor | framework    | preset              |
|-------------|--------------|---------------------|
| 5           | sveltekit    | `sveltekit`         |
| 5           | vite-svelte  | `recommended`       |
| 4           | sveltekit    | `svelte4-sveltekit` |
| 4           | vite-svelte  | `svelte4`           |

### New Svelte 4 rules

All four mirror existing svelte5 patterns; details for the implementation plan:

- **`no-fetch-in-onMount`** — error. Selector `CallExpression[callee.name="onMount"]`; inside the callback flag `fetch(...)`, `axios.get/post/put/delete(...)`, `$fetch(...)`. Mirror of `no-fetch-in-effect`.
- **`no-mutation-of-export-let`** — error. Collect identifiers from `ExportNamedDeclaration > VariableDeclaration` with `let`/`var`; flag `AssignmentExpression` and `UpdateExpression` targeting them, except inside `bind:` attribute handlers. Mirror of `no-mutation-of-props`.
- **`prefer-reactive-statement`** — warn. Top-level `let foo = expr` in `<script>` where `expr` references another `let`/prop and `foo` is later read in template; suggest `$: foo = expr`.
- **`no-leaked-subscriptions`** — warn. Inside `onMount` callback, flag a `.subscribe(...)` call result not assigned to a variable used in cleanup, or `addEventListener(...)` without a matching `removeEventListener` in the returned cleanup function.

### CLI (`cli.ts`)

New flag `--svelte-version <4|5>`. Validation: only `"4"` or `"5"`; otherwise throw `SvelteDoctorError` with hint `Use --svelte-version 4 or --svelte-version 5`. Threaded into `detectProject` via `svelteVersionOverride`.

### Banner (`utils/banner.ts`)

Format `Detected: <Framework> · Svelte <major><suffix> · <packageManager>`, where `<suffix>` is:
- `(runes)` for major 5 unless overridden
- `` (empty) for major 4
- `(forced)` when source is `"override"`
- `(resolved from node_modules)` when source is `"node_modules"`
- `(assumed — could not detect)` when source is `"assumed"`

### JSON report (`types.ts`, `index.ts`)

`ProjectInfo` changes:
- `svelteMajor: 4 | 5` (was `number | null`).
- `svelteVersionSource: "package.json" | "node_modules" | "override" | "assumed"` — new field.

Other `JsonReport` fields unchanged.

## Data flow

```
cli.ts
  ├─ parses --svelte-version → svelteVersionOverride
  └─ scan(rootInput, { svelteVersionOverride, ... })
      └─ detectProject(rootInput, { svelteVersionOverride })
          ├─ readPackageJson
          ├─ resolveSvelteMajor (override → pkg → node_modules → assumed)
          ├─ detectFramework
          └─ returns ProjectInfo { svelteMajor, svelteVersionSource, ... }
      ├─ preflightSvelteProject(project) — accepts 4 and 5, rejects others
      └─ buildEslint(project, ...)
          └─ picks preset from (svelteMajor, framework)
```

## Testing

- `tests/framework-detection.test.ts` — Svelte 4 from package.json; node_modules fallback; override; assumed fallback (asserts `svelteVersionSource`).
- `tests/preflight.test.ts` — Svelte 4 accepted; Svelte 3 rejected; Svelte 6 rejected with update hint.
- `tests/rules/svelte4/<rule>.test.ts` — one file per new rule with passing case, error case, inline-disable case, and one rule-specific edge (e.g. mutation inside `bind:` handler must pass for `no-mutation-of-export-let`).
- `tests/rules/svelte4/integration.test.ts` — scanning a `svelte@^4.2.0` fixture project loads the `svelte4` (or `svelte4-sveltekit`) preset, not the rune presets.
- `tests/scope.test.ts` — `--svelte-version 4` on a Svelte 5 project forces `svelte4` preset.

## Backwards compatibility

- `peerDependencies.svelte`: `"^5.0.0"` → `"^4.0.0 || ^5.0.0"`.
- `keywords` in `package.json`: add `"svelte4"`.
- `ProjectInfo.svelteMajor` becomes `4 | 5` instead of `number | null` — **breaking** for `/api` consumers reading the type. Acceptable pre-1.0; bump to **0.2.0** and call it out in CHANGELOG / README.
- `JsonReport.project.svelteVersionSource` is additive.

## README updates

- Tagline: `Works with **Svelte 4 and Svelte 5 (runes)** in **SvelteKit** and **Vite + Svelte** projects.`
- Rules table: add `Versions` column (`5`, `4`, `4 & 5`).
- CLI section: document `--svelte-version <4|5>`.
- New FAQ entry: `Which rules run on which version?`

## Out of scope

- Hybrid components (`<svelte:options runes={false}>` in a Svelte 5 project).
- Migration suggestions (rune ↔ legacy rewrite hints).
- Per-version filtering of interactive scope prompt.
- Workspace projects with mixed Svelte majors — the existing per-project workspace logic should already handle this once `svelteMajor` is resolved per workspace project, but no extra design work is committed here.

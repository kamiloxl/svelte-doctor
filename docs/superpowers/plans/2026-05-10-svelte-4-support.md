# Svelte 4 Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support scanning Svelte 4 projects alongside Svelte 5: deterministic version detection (package.json → node_modules fallback → assumed-5), four new Svelte-4-specific lint rules, two new ESLint preset configs, a `--svelte-version` CLI override, and updated banner / JSON report / README.

**Architecture:** Mirror the existing `rules/svelte5/` directory with a parallel `rules/svelte4/` directory that targets legacy syntax (`onMount`, `export let`, `let foo = expr`, `.subscribe`). Add `svelte4` and `svelte4-sveltekit` preset configs to the same ESLint plugin. Centralize version resolution in `framework-detection.ts` so `ProjectInfo.svelteMajor` becomes non-nullable (`4 | 5`) and gains a `svelteVersionSource` discriminator. `scan.ts` selects the preset from `(svelteMajor, framework)`.

**Tech Stack:** TypeScript, ESLint flat config, `svelte-eslint-parser`, vitest, commander.

---

## File Structure

**New files:**
- `packages/svelte-doctor/src/plugin/rules/svelte4/no-fetch-in-onMount.ts`
- `packages/svelte-doctor/src/plugin/rules/svelte4/no-mutation-of-export-let.ts`
- `packages/svelte-doctor/src/plugin/rules/svelte4/prefer-reactive-statement.ts`
- `packages/svelte-doctor/src/plugin/rules/svelte4/no-leaked-subscriptions.ts`
- `packages/svelte-doctor/tests/rules/svelte4/no-fetch-in-onMount.test.ts`
- `packages/svelte-doctor/tests/rules/svelte4/no-mutation-of-export-let.test.ts`
- `packages/svelte-doctor/tests/rules/svelte4/prefer-reactive-statement.test.ts`
- `packages/svelte-doctor/tests/rules/svelte4/no-leaked-subscriptions.test.ts`
- `packages/svelte-doctor/tests/rules/svelte4/integration.test.ts`
- `packages/svelte-doctor/docs/rules/no-fetch-in-onMount.md`
- `packages/svelte-doctor/docs/rules/no-mutation-of-export-let.md`
- `packages/svelte-doctor/docs/rules/prefer-reactive-statement.md`
- `packages/svelte-doctor/docs/rules/no-leaked-subscriptions.md`

**Modified files:**
- `packages/svelte-doctor/src/types.ts` — `ProjectInfo.svelteMajor: 4 | 5`, add `svelteVersionSource`.
- `packages/svelte-doctor/src/utils/framework-detection.ts` — new resolution chain + override option.
- `packages/svelte-doctor/src/eslint-plugin.ts` — register svelte4 rules, expose `svelte4` and `svelte4-sveltekit` configs.
- `packages/svelte-doctor/src/scan.ts` — preset selection by `(svelteMajor, framework)`, thread override into detect.
- `packages/svelte-doctor/src/cli.ts` — `--svelte-version <4|5>` option, validation, threading.
- `packages/svelte-doctor/src/utils/banner.ts` — display major + source suffix.
- `packages/svelte-doctor/package.json` — `peerDependencies.svelte` widened, version bump to 0.2.0, keyword.
- `packages/svelte-doctor/tests/framework-detection.test.ts` — new cases.
- `packages/svelte-doctor/tests/preflight.test.ts` — flip Svelte 4 expectations, add Svelte 3 / 6 cases.
- `packages/svelte-doctor/tests/scope.test.ts` — `--svelte-version 4` case.
- `README.md` (repo root) — tagline, rules table, CLI section, FAQ.

---

## Task 1: Update types — non-null `svelteMajor` and `svelteVersionSource`

**Files:**
- Modify: `packages/svelte-doctor/src/types.ts`

- [ ] **Step 1: Edit ProjectInfo type**

Replace the existing `ProjectInfo` interface in `packages/svelte-doctor/src/types.ts` with:

```ts
export type SvelteMajor = 4 | 5;

export type SvelteVersionSource =
  | "package.json"
  | "node_modules"
  | "override"
  | "assumed";

export interface ProjectInfo {
  root: string;
  framework: Framework;
  svelteVersion: string | null;
  svelteMajor: SvelteMajor;
  svelteVersionSource: SvelteVersionSource;
  hasTypeScript: boolean;
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
}
```

- [ ] **Step 2: Run typecheck to see all callers needing updates**

Run from repo root: `pnpm --filter svelte-doctor-cli typecheck`
Expected: errors in `framework-detection.ts`, `scan.ts`, `index.ts`, `tests/preflight.test.ts`, `tests/framework-detection.test.ts`. Note these — they get fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/svelte-doctor/src/types.ts
git commit -m "types: ProjectInfo.svelteMajor is 4|5 and gains svelteVersionSource"
```

---

## Task 2: Centralize svelte major resolution in framework-detection

**Files:**
- Modify: `packages/svelte-doctor/src/utils/framework-detection.ts`

- [ ] **Step 1: Add new option type and resolution helper at top of file**

Insert after the existing imports in `packages/svelte-doctor/src/utils/framework-detection.ts`:

```ts
import type { ProjectInfo, SvelteMajor, SvelteVersionSource } from "../types.js";

export interface DetectProjectOptions {
  svelteMajorOverride?: SvelteMajor;
}

interface ResolvedSvelteMajor {
  major: SvelteMajor;
  source: SvelteVersionSource;
}
```

(Replace the existing `import type { Framework, ProjectInfo } from "../types.js";` with the import above so `SvelteMajor` and `SvelteVersionSource` are also pulled.)

- [ ] **Step 2: Add resolution chain function**

Add this function inside `framework-detection.ts`, above `detectProject`:

```ts
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
```

- [ ] **Step 3: Update `detectProject` signature and body**

Replace the existing `detectProject` function with:

```ts
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
```

- [ ] **Step 4: Update `preflightSvelteProject` to accept Svelte 4 and reject only out-of-range versions**

Replace the existing `preflightSvelteProject` function with:

```ts
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
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter svelte-doctor-cli typecheck`
Expected: framework-detection.ts errors gone. Errors remain in `scan.ts`, `index.ts`, tests — those are fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/svelte-doctor/src/utils/framework-detection.ts
git commit -m "framework-detection: resolve svelte major (override → pkg → node_modules → assumed)"
```

---

## Task 3: Update framework-detection tests

**Files:**
- Modify: `packages/svelte-doctor/tests/framework-detection.test.ts`

- [ ] **Step 1: Replace test file with full updated version**

Overwrite `packages/svelte-doctor/tests/framework-detection.test.ts` with:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectProject } from "../src/utils/framework-detection.js";

let cwd: string;

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "svelte-doctor-cli-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("detectProject", () => {
  it("detects SvelteKit + Svelte 5 + pnpm", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "^5.0.0", "@sveltejs/kit": "^2.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    });
    writeFileSync(join(cwd, "pnpm-lock.yaml"), "");
    writeFileSync(join(cwd, "tsconfig.json"), "{}");

    const info = detectProject(cwd);

    expect(info.framework).toBe("sveltekit");
    expect(info.svelteMajor).toBe(5);
    expect(info.svelteVersionSource).toBe("package.json");
    expect(info.packageManager).toBe("pnpm");
    expect(info.hasTypeScript).toBe(true);
  });

  it("detects Svelte 4 from package.json", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "^4.2.0" },
      devDependencies: { vite: "^4.0.0" },
    });

    const info = detectProject(cwd);

    expect(info.svelteMajor).toBe(4);
    expect(info.svelteVersionSource).toBe("package.json");
    expect(info.framework).toBe("vite-svelte");
  });

  it("falls back to node_modules/svelte when version is workspace:*", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "workspace:*" },
    });
    mkdirSync(join(cwd, "node_modules", "svelte"), { recursive: true });
    writeJson(join(cwd, "node_modules", "svelte", "package.json"), {
      name: "svelte",
      version: "4.2.7",
    });

    const info = detectProject(cwd);

    expect(info.svelteMajor).toBe(4);
    expect(info.svelteVersionSource).toBe("node_modules");
  });

  it("assumes Svelte 5 when nothing is resolvable", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "next" },
    });

    const info = detectProject(cwd);

    expect(info.svelteMajor).toBe(5);
    expect(info.svelteVersionSource).toBe("assumed");
  });

  it("respects svelteMajorOverride", () => {
    writeJson(join(cwd, "package.json"), {
      dependencies: { svelte: "^5.0.0" },
    });

    const info = detectProject(cwd, { svelteMajorOverride: 4 });

    expect(info.svelteMajor).toBe(4);
    expect(info.svelteVersionSource).toBe("override");
  });

  it("detects Vite + Svelte SPA when svelte+vite present without kit", () => {
    writeJson(join(cwd, "package.json"), {
      devDependencies: { svelte: "^5.0.0", vite: "^5.0.0" },
    });
    writeFileSync(join(cwd, "package-lock.json"), "{}");

    const info = detectProject(cwd);

    expect(info.framework).toBe("vite-svelte");
    expect(info.packageManager).toBe("npm");
  });

  it("returns unknown framework but assumed Svelte 5 when no svelte present", () => {
    writeJson(join(cwd, "package.json"), { dependencies: { react: "^18" } });

    const info = detectProject(cwd);

    expect(info.framework).toBe("unknown");
    expect(info.svelteVersion).toBeNull();
    expect(info.svelteMajor).toBe(5);
    expect(info.svelteVersionSource).toBe("assumed");
  });

  it("throws when root does not exist", () => {
    expect(() => detectProject(join(cwd, "missing"))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter svelte-doctor-cli test -- framework-detection`
Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/svelte-doctor/tests/framework-detection.test.ts
git commit -m "test(framework-detection): cover Svelte 4, override, node_modules fallback, assumed"
```

---

## Task 4: Update preflight tests

**Files:**
- Modify: `packages/svelte-doctor/tests/preflight.test.ts`

- [ ] **Step 1: Replace preflight test file**

Overwrite `packages/svelte-doctor/tests/preflight.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { preflightSvelteProject } from "../src/utils/framework-detection.js";
import type { ProjectInfo } from "../src/types.js";

const baseInfo = (over: Partial<ProjectInfo>): ProjectInfo => ({
  root: "/x",
  framework: "unknown",
  svelteVersion: null,
  svelteMajor: 5,
  svelteVersionSource: "assumed",
  hasTypeScript: false,
  packageManager: "unknown",
  ...over,
});

describe("preflightSvelteProject", () => {
  it("rejects non-Svelte projects with hint", () => {
    const r = preflightSvelteProject(baseInfo({}));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not look like a Svelte project/);
    expect(r.hint).toMatch(/npm create svelte/);
  });

  it("accepts Svelte 4 vite-svelte", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^4.2.0",
        svelteMajor: 4,
        svelteVersionSource: "package.json",
        framework: "vite-svelte",
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("accepts Svelte 5 SvelteKit", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^5.0.0",
        svelteMajor: 5,
        svelteVersionSource: "package.json",
        framework: "sveltekit",
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects Svelte 3 with upgrade hint", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^3.55.0",
        svelteMajor: 5,
        svelteVersionSource: "package.json",
        framework: "vite-svelte",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Svelte 4 and 5/);
  });

  it("rejects Svelte 6 with update hint", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "^6.0.0",
        svelteMajor: 5,
        svelteVersionSource: "package.json",
        framework: "vite-svelte",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/svelte-doctor-cli@latest/);
  });

  it("accepts Svelte 5 with unparseable version (workspace tag)", () => {
    const r = preflightSvelteProject(
      baseInfo({
        svelteVersion: "workspace:*",
        svelteMajor: 5,
        svelteVersionSource: "node_modules",
        framework: "sveltekit",
      }),
    );
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter svelte-doctor-cli test -- preflight`
Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/svelte-doctor/tests/preflight.test.ts
git commit -m "test(preflight): accept Svelte 4, reject Svelte 3 and 6"
```

---

## Task 5: Rule — `no-fetch-in-onMount` (test-first)

**Files:**
- Create: `packages/svelte-doctor/tests/rules/svelte4/no-fetch-in-onMount.test.ts`
- Create: `packages/svelte-doctor/src/plugin/rules/svelte4/no-fetch-in-onMount.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/svelte-doctor/tests/rules/svelte4/no-fetch-in-onMount.test.ts`:

```ts
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/no-fetch-in-onMount.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-fetch-in-onMount", () => {
  it("validates fixtures", () => {
    tester.run("no-fetch-in-onMount", rule, {
      valid: [
        { code: "fetch('/api/foo');" },
        { code: "onMount(() => { console.log('ok'); });" },
        { code: "async function load() { await fetch('/api/foo'); }" },
        { code: "onMount(() => () => clearTimeout(timer));" },
      ],
      invalid: [
        {
          code: "onMount(() => { fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInOnMount" }],
        },
        {
          code: "onMount(async () => { const r = await fetch('/api/foo'); });",
          errors: [{ messageId: "fetchInOnMount" }],
        },
        {
          code: "onMount(() => { axios.get('/api/foo'); });",
          errors: [{ messageId: "fetchInOnMount" }],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter svelte-doctor-cli test -- no-fetch-in-onMount`
Expected: FAIL with "Cannot find module .../no-fetch-in-onMount.js".

- [ ] **Step 3: Implement the rule**

Create `packages/svelte-doctor/src/plugin/rules/svelte4/no-fetch-in-onMount.ts`:

```ts
import type { Rule } from "eslint";
import type { CallExpression, Node } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-fetch-in-onMount";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "error",
  description:
    "Disallow `fetch(...)` (and axios/$fetch) inside `onMount(...)`. Move the request to a SvelteKit load function or a top-level await.",
});

const HTTP_CALL_NAMES = new Set(["fetch", "$fetch"]);
const HTTP_METHOD_NAMES = new Set([
  "fetch",
  "get",
  "post",
  "put",
  "delete",
  "patch",
]);
const HTTP_OBJECT_NAMES = new Set(["axios", "$fetch"]);

function isHttpCall(node: CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier" && HTTP_CALL_NAMES.has(callee.name)) {
    return true;
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    HTTP_METHOD_NAMES.has(callee.property.name) &&
    callee.object.type === "Identifier" &&
    HTTP_OBJECT_NAMES.has(callee.object.name)
  ) {
    return true;
  }
  return false;
}

function isOnMountCall(node: CallExpression): boolean {
  return node.callee.type === "Identifier" && node.callee.name === "onMount";
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow fetch() inside onMount — prefer SvelteKit load functions or {#await}.",
      recommended: true,
    },
    schema: [],
    messages: {
      fetchInOnMount:
        "Do not call fetch() inside onMount. Move the request to a SvelteKit load function or use {#await} with a top-level promise.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        if (!isHttpCall(node as unknown as CallExpression)) return;
        const ancestors = sourceCode.getAncestors(node) as Node[];
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const ancestor = ancestors[i];
          if (
            ancestor.type === "CallExpression" &&
            isOnMountCall(ancestor as CallExpression)
          ) {
            context.report({ node, messageId: "fetchInOnMount" });
            return;
          }
        }
      },
    };
  },
};

export const ruleId = RULE_ID;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter svelte-doctor-cli test -- no-fetch-in-onMount`
Expected: PASS (1 test, 7 fixtures).

- [ ] **Step 5: Commit**

```bash
git add packages/svelte-doctor/src/plugin/rules/svelte4/no-fetch-in-onMount.ts \
        packages/svelte-doctor/tests/rules/svelte4/no-fetch-in-onMount.test.ts
git commit -m "feat(svelte4): add no-fetch-in-onMount rule"
```

---

## Task 6: Rule — `no-mutation-of-export-let` (test-first)

**Files:**
- Create: `packages/svelte-doctor/tests/rules/svelte4/no-mutation-of-export-let.test.ts`
- Create: `packages/svelte-doctor/src/plugin/rules/svelte4/no-mutation-of-export-let.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/svelte-doctor/tests/rules/svelte4/no-mutation-of-export-let.test.ts`:

```ts
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/no-mutation-of-export-let.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-mutation-of-export-let", () => {
  it("validates fixtures", () => {
    tester.run("no-mutation-of-export-let", rule, {
      valid: [
        { code: "export let name; console.log(name);" },
        { code: "let local = 1; local = 2;" },
        { code: "export let name; let copy = name; copy = 'x';" },
        { code: "export const fixed = 1;" },
      ],
      invalid: [
        {
          code: "export let name; name = 'x';",
          errors: [{ messageId: "mutation" }],
        },
        {
          code: "export let user; user.name = 'x';",
          errors: [{ messageId: "mutation" }],
        },
        {
          code: "export let count; count++;",
          errors: [{ messageId: "mutation" }],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter svelte-doctor-cli test -- no-mutation-of-export-let`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rule**

Create `packages/svelte-doctor/src/plugin/rules/svelte4/no-mutation-of-export-let.ts`:

```ts
import type { Rule } from "eslint";
import type {
  AssignmentExpression,
  ExportNamedDeclaration,
  Identifier,
  Pattern,
  UpdateExpression,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-mutation-of-export-let";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "error",
  description:
    "Mutating a Svelte 4 prop declared via `export let` breaks one-way data flow. Lift state up or expose a callback prop.",
});

function collectPatternNames(pattern: Pattern, out: Set<string>): void {
  if (pattern.type === "Identifier") {
    out.add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "Property") {
        collectPatternNames(prop.value as Pattern, out);
      } else if (prop.type === "RestElement") {
        collectPatternNames(prop.argument as Pattern, out);
      }
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) {
      if (element) collectPatternNames(element as Pattern, out);
    }
    return;
  }
  if (pattern.type === "RestElement") {
    collectPatternNames(pattern.argument as Pattern, out);
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    collectPatternNames(pattern.left as Pattern, out);
  }
}

function rootIdentifier(
  node: AssignmentExpression["left"] | UpdateExpression["argument"],
): Identifier | null {
  if (node.type === "Identifier") return node;
  if (node.type === "MemberExpression") {
    return rootIdentifier(node.object as AssignmentExpression["left"]);
  }
  return null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow assigning to identifiers declared via `export let`.",
      recommended: true,
    },
    schema: [],
    messages: {
      mutation:
        "`{{name}}` is a Svelte 4 prop (declared with `export let`) and should not be mutated. Lift state up or expose a callback prop.",
    },
  },
  create(context) {
    const propsNames = new Set<string>();

    return {
      ExportNamedDeclaration(node: ExportNamedDeclaration) {
        const decl = node.declaration;
        if (
          !decl ||
          decl.type !== "VariableDeclaration" ||
          decl.kind !== "let"
        ) {
          return;
        }
        for (const declarator of decl.declarations) {
          collectPatternNames(declarator.id as Pattern, propsNames);
        }
      },
      AssignmentExpression(node: AssignmentExpression) {
        const root = rootIdentifier(node.left);
        if (!root || !propsNames.has(root.name)) return;
        context.report({
          node,
          messageId: "mutation",
          data: { name: root.name },
        });
      },
      UpdateExpression(node: UpdateExpression) {
        const root = rootIdentifier(node.argument);
        if (!root || !propsNames.has(root.name)) return;
        context.report({
          node,
          messageId: "mutation",
          data: { name: root.name },
        });
      },
    };
  },
};

export const ruleId = RULE_ID;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter svelte-doctor-cli test -- no-mutation-of-export-let`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/svelte-doctor/src/plugin/rules/svelte4/no-mutation-of-export-let.ts \
        packages/svelte-doctor/tests/rules/svelte4/no-mutation-of-export-let.test.ts
git commit -m "feat(svelte4): add no-mutation-of-export-let rule"
```

---

## Task 7: Rule — `prefer-reactive-statement` (test-first)

**Files:**
- Create: `packages/svelte-doctor/tests/rules/svelte4/prefer-reactive-statement.test.ts`
- Create: `packages/svelte-doctor/src/plugin/rules/svelte4/prefer-reactive-statement.ts`

The simplified heuristic for v1: top-level `let foo = expr` in a module where the module also contains `export let` declarations and `expr` references at least one of them. We rely on Svelte 4 component context: `<script>` modules typically declare props with `export let` and derive locals.

- [ ] **Step 1: Write the failing test**

Create `packages/svelte-doctor/tests/rules/svelte4/prefer-reactive-statement.test.ts`:

```ts
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/prefer-reactive-statement.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("prefer-reactive-statement", () => {
  it("validates fixtures", () => {
    tester.run("prefer-reactive-statement", rule, {
      valid: [
        // No props in module — nothing to derive from.
        { code: "let total = 1 + 2;" },
        // Reactive statement is the correct form — passes.
        { code: "export let count; $: doubled = count * 2;" },
        // Const literal initializer, no prop reference.
        { code: "export let count; const PI = 3.14;" },
        // Local derived from another local — out of scope for this heuristic.
        { code: "let a = 1; let b = a + 1;" },
      ],
      invalid: [
        {
          code: "export let count; let doubled = count * 2;",
          errors: [{ messageId: "preferReactive", data: { name: "doubled" } }],
        },
        {
          code: "export let user; let label = user.name + '!';",
          errors: [{ messageId: "preferReactive", data: { name: "label" } }],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter svelte-doctor-cli test -- prefer-reactive-statement`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rule**

Create `packages/svelte-doctor/src/plugin/rules/svelte4/prefer-reactive-statement.ts`:

```ts
import type { Rule } from "eslint";
import type {
  ExportNamedDeclaration,
  Identifier,
  Node,
  Pattern,
  Program,
  VariableDeclaration,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "prefer-reactive-statement";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "Prefer `$: foo = expr` for values derived from props/state in Svelte 4. A bare `let foo = expr` does not re-run when its inputs change.",
});

function collectIdentifiersInPattern(
  pattern: Pattern,
  out: Set<string>,
): void {
  if (pattern.type === "Identifier") {
    out.add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "Property") {
        collectIdentifiersInPattern(prop.value as Pattern, out);
      } else if (prop.type === "RestElement") {
        collectIdentifiersInPattern(prop.argument as Pattern, out);
      }
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const el of pattern.elements) {
      if (el) collectIdentifiersInPattern(el as Pattern, out);
    }
    return;
  }
  if (pattern.type === "RestElement") {
    collectIdentifiersInPattern(pattern.argument as Pattern, out);
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    collectIdentifiersInPattern(pattern.left as Pattern, out);
  }
}

function exprReferencesAny(expr: Node, names: Set<string>): boolean {
  const stack: Node[] = [expr];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || !("type" in current)) {
      continue;
    }
    if (current.type === "Identifier" && names.has((current as Identifier).name)) {
      return true;
    }
    for (const key of Object.keys(current)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            stack.push(item as Node);
          }
        }
      } else if (child && typeof child === "object" && "type" in child) {
        stack.push(child as Node);
      }
    }
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer `$: foo = expr` over `let foo = expr` when expr references a prop in Svelte 4.",
      recommended: true,
    },
    schema: [],
    messages: {
      preferReactive:
        "`{{name}}` is derived from a prop but declared with plain `let` — use `$: {{name}} = ...` so it updates when the prop changes.",
    },
  },
  create(context) {
    return {
      Program(program: Program) {
        const propsNames = new Set<string>();
        for (const stmt of program.body) {
          if (stmt.type !== "ExportNamedDeclaration") continue;
          const exp = stmt as ExportNamedDeclaration;
          const decl = exp.declaration;
          if (
            !decl ||
            decl.type !== "VariableDeclaration" ||
            decl.kind !== "let"
          ) {
            continue;
          }
          for (const declarator of decl.declarations) {
            collectIdentifiersInPattern(declarator.id as Pattern, propsNames);
          }
        }
        if (!propsNames.size) return;

        for (const stmt of program.body) {
          if (stmt.type !== "VariableDeclaration") continue;
          const varDecl = stmt as VariableDeclaration;
          if (varDecl.kind !== "let") continue;
          for (const declarator of varDecl.declarations) {
            if (!declarator.init) continue;
            if (declarator.id.type !== "Identifier") continue;
            const name = declarator.id.name;
            if (propsNames.has(name)) continue;
            if (!exprReferencesAny(declarator.init as Node, propsNames)) {
              continue;
            }
            context.report({
              node: declarator,
              messageId: "preferReactive",
              data: { name },
            });
          }
        }
      },
    };
  },
};

export const ruleId = RULE_ID;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter svelte-doctor-cli test -- prefer-reactive-statement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/svelte-doctor/src/plugin/rules/svelte4/prefer-reactive-statement.ts \
        packages/svelte-doctor/tests/rules/svelte4/prefer-reactive-statement.test.ts
git commit -m "feat(svelte4): add prefer-reactive-statement rule"
```

---

## Task 8: Rule — `no-leaked-subscriptions` (test-first)

**Files:**
- Create: `packages/svelte-doctor/tests/rules/svelte4/no-leaked-subscriptions.test.ts`
- Create: `packages/svelte-doctor/src/plugin/rules/svelte4/no-leaked-subscriptions.ts`

Heuristic: inside an `onMount(callback)`, if the callback body contains a call ending in `.subscribe(...)` or `addEventListener(...)`, the callback must return a function (cleanup) — same shape as the existing `no-effect-without-cleanup` for `$effect`.

- [ ] **Step 1: Write the failing test**

Create `packages/svelte-doctor/tests/rules/svelte4/no-leaked-subscriptions.test.ts`:

```ts
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../../src/plugin/rules/svelte4/no-leaked-subscriptions.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-leaked-subscriptions", () => {
  it("validates fixtures", () => {
    tester.run("no-leaked-subscriptions", rule, {
      valid: [
        { code: "onMount(() => { console.log('ok'); });" },
        {
          code: "onMount(() => { const u = store.subscribe(v => {}); return () => u(); });",
        },
        {
          code: "onMount(() => { window.addEventListener('click', h); return () => window.removeEventListener('click', h); });",
        },
      ],
      invalid: [
        {
          code: "onMount(() => { store.subscribe(v => {}); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "onMount(() => { window.addEventListener('click', h); });",
          errors: [{ messageId: "missingCleanup" }],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter svelte-doctor-cli test -- no-leaked-subscriptions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rule**

Create `packages/svelte-doctor/src/plugin/rules/svelte4/no-leaked-subscriptions.ts`:

```ts
import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Node,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-leaked-subscriptions";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "An `onMount` callback that subscribes to a store or registers a listener must return a cleanup function or it will leak when the component unmounts.",
});

const NEEDS_CLEANUP_NAMES = new Set([
  "subscribe",
  "addEventListener",
  "setInterval",
  "setTimeout",
]);

function isOnMountCall(node: CallExpression): boolean {
  return node.callee.type === "Identifier" && node.callee.name === "onMount";
}

function calleeName(node: CallExpression): string | null {
  if (node.callee.type === "Identifier") return node.callee.name;
  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier"
  ) {
    return node.callee.property.name;
  }
  return null;
}

function fnBodyStatements(
  fn: ArrowFunctionExpression | FunctionExpression,
): readonly Node[] {
  if (fn.body.type === "BlockStatement") return fn.body.body;
  return [fn.body];
}

function hasReturnStatement(
  fn: ArrowFunctionExpression | FunctionExpression,
): boolean {
  if (fn.body.type !== "BlockStatement") return true;
  return fn.body.body.some(
    (stmt) =>
      stmt.type === "ReturnStatement" &&
      stmt.argument != null &&
      stmt.argument.type !== "Literal",
  );
}

function bodyRegistersListener(
  fn: ArrowFunctionExpression | FunctionExpression,
): boolean {
  const stack: Node[] = [...fnBodyStatements(fn)] as Node[];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || !("type" in current)) continue;
    if (current.type === "CallExpression") {
      const name = calleeName(current as CallExpression);
      if (name && NEEDS_CLEANUP_NAMES.has(name)) return true;
    }
    if (
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    ) {
      continue;
    }
    for (const key of Object.keys(current)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            stack.push(item as Node);
          }
        }
      } else if (child && typeof child === "object" && "type" in child) {
        stack.push(child as Node);
      }
    }
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn when onMount registers subscriptions/listeners without returning a cleanup function.",
      recommended: true,
    },
    schema: [],
    messages: {
      missingCleanup:
        "onMount registers a subscription or listener but does not return a cleanup function — it will leak after unmount.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isOnMountCall(node as CallExpression)) return;
        const arg = (node as CallExpression).arguments[0];
        if (
          !arg ||
          (arg.type !== "ArrowFunctionExpression" &&
            arg.type !== "FunctionExpression")
        ) {
          return;
        }
        const fn = arg as ArrowFunctionExpression | FunctionExpression;
        if (!bodyRegistersListener(fn)) return;
        if (hasReturnStatement(fn)) return;
        context.report({ node, messageId: "missingCleanup" });
      },
    };
  },
};

export const ruleId = RULE_ID;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter svelte-doctor-cli test -- no-leaked-subscriptions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/svelte-doctor/src/plugin/rules/svelte4/no-leaked-subscriptions.ts \
        packages/svelte-doctor/tests/rules/svelte4/no-leaked-subscriptions.test.ts
git commit -m "feat(svelte4): add no-leaked-subscriptions rule"
```

---

## Task 9: Register Svelte 4 rules and add presets in `eslint-plugin.ts`

**Files:**
- Modify: `packages/svelte-doctor/src/eslint-plugin.ts`

- [ ] **Step 1: Add imports for the four svelte4 rules**

In `packages/svelte-doctor/src/eslint-plugin.ts`, after the existing `import { rule as componentTooLarge } ...` line, add:

```ts
import { rule as noFetchInOnMount } from "./plugin/rules/svelte4/no-fetch-in-onMount.js";
import { rule as noMutationOfExportLet } from "./plugin/rules/svelte4/no-mutation-of-export-let.js";
import { rule as preferReactiveStatement } from "./plugin/rules/svelte4/prefer-reactive-statement.js";
import { rule as noLeakedSubscriptions } from "./plugin/rules/svelte4/no-leaked-subscriptions.js";
```

- [ ] **Step 2: Add svelte4 rules to the registry**

Add a new `svelte4Rules` block right after `sveltekitOnlyRules` and merge into `allRules`. Replace the existing `allRules` const with:

```ts
const svelte4OnlyRules: Record<string, Rule.RuleModule> = {
  "no-fetch-in-onMount": noFetchInOnMount,
  "no-mutation-of-export-let": noMutationOfExportLet,
  "prefer-reactive-statement": preferReactiveStatement,
  "no-leaked-subscriptions": noLeakedSubscriptions,
};

const allRules: Record<string, Rule.RuleModule> = {
  ...universalRules,
  ...sveltekitOnlyRules,
  ...svelte4OnlyRules,
};
```

- [ ] **Step 3: Build svelte4 rule severity records**

After the existing `recommendedRules` and `sveltekitRules` declarations, add:

```ts
const svelte4UniversalRules: Linter.RulesRecord = {
  [`${RULE_PREFIX}/no-fetch-in-onMount`]: "error",
  [`${RULE_PREFIX}/no-mutation-of-export-let`]: "error",
  [`${RULE_PREFIX}/prefer-reactive-statement`]: "warn",
  [`${RULE_PREFIX}/no-leaked-subscriptions`]: "warn",
  [`${RULE_PREFIX}/no-array-index-as-each-key`]: "warn",
  [`${RULE_PREFIX}/no-unsafe-html-binding`]: "error",
  [`${RULE_PREFIX}/no-href-javascript`]: "error",
  [`${RULE_PREFIX}/component-too-large`]: "warn",
};

const svelte4SveltekitRules: Linter.RulesRecord = {
  ...svelte4UniversalRules,
  [`${RULE_PREFIX}/server-only-import-in-client`]: "error",
  [`${RULE_PREFIX}/no-fetch-in-load-without-event`]: "error",
};
```

- [ ] **Step 4: Add the new presets**

After the `sveltekit` config declaration, add:

```ts
const svelte4: Linter.Config = {
  name: `${RULE_PREFIX}/svelte4`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: svelte4UniversalRules,
};

const svelte4Sveltekit: Linter.Config = {
  name: `${RULE_PREFIX}/svelte4-sveltekit`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: svelte4SveltekitRules,
};
```

- [ ] **Step 5: Update the exported configs object**

Replace the existing `exported` declaration with:

```ts
const exported: ESLint.Plugin & {
  configs: {
    recommended: Linter.Config;
    sveltekit: Linter.Config;
    svelte4: Linter.Config;
    "svelte4-sveltekit": Linter.Config;
  };
} = {
  ...plugin,
  configs: {
    recommended,
    sveltekit,
    svelte4,
    "svelte4-sveltekit": svelte4Sveltekit,
  },
};
```

- [ ] **Step 6: Add new ids to `RECOMMENDED_RULE_IDS`**

Replace the existing `RECOMMENDED_RULE_IDS` block with:

```ts
export const RECOMMENDED_RULE_IDS: string[] = [
  "no-fetch-in-effect",
  "no-mutation-of-props",
  "no-circular-reactivity",
  "prefer-derived-over-effect",
  "no-fetch-in-onMount",
  "no-mutation-of-export-let",
  "no-unsafe-html-binding",
  "no-href-javascript",
  "server-only-import-in-client",
  "no-fetch-in-load-without-event",
];
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter svelte-doctor-cli typecheck`
Expected: passes within `eslint-plugin.ts` (`scan.ts` errors remain — fixed in next task).

- [ ] **Step 8: Commit**

```bash
git add packages/svelte-doctor/src/eslint-plugin.ts
git commit -m "eslint-plugin: register svelte4 rules and add svelte4 / svelte4-sveltekit presets"
```

---

## Task 10: Wire preset selection in `scan.ts`

**Files:**
- Modify: `packages/svelte-doctor/src/scan.ts`

- [ ] **Step 1: Add svelteMajorOverride to ScanOptions**

Replace the existing `ScanOptions` interface in `packages/svelte-doctor/src/scan.ts` with:

```ts
export interface ScanOptions {
  lint?: boolean;
  deadCode?: boolean;
  diff?: GitDiffOptions;
  configOverrides?: Partial<SvelteDoctorConfig>;
  /** Workspace sub-project name(s), comma-separated. Resolved against project root. */
  project?: string;
  /** Override detected svelte major. Used by --svelte-version CLI flag. */
  svelteMajorOverride?: 4 | 5;
  /** Optional callback invoked when scan moves between stages (for spinner UX). */
  onStage?: (stage: ScanStage) => void;
}
```

- [ ] **Step 2: Replace preset selection logic in `buildEslint`**

Find the current `baseConfig` assignment in `buildEslint`:

```ts
  const baseConfig =
    project.framework === "sveltekit"
      ? svelteDoctorPlugin.configs.sveltekit
      : svelteDoctorPlugin.configs.recommended;
```

Replace it with:

```ts
  const baseConfig = pickPreset(project);
```

Then add this helper above `buildEslint`:

```ts
function pickPreset(project: ProjectInfo): Linter.Config {
  if (project.svelteMajor === 4) {
    return project.framework === "sveltekit"
      ? svelteDoctorPlugin.configs["svelte4-sveltekit"]
      : svelteDoctorPlugin.configs.svelte4;
  }
  return project.framework === "sveltekit"
    ? svelteDoctorPlugin.configs.sveltekit
    : svelteDoctorPlugin.configs.recommended;
}
```

- [ ] **Step 3: Thread override into `detectProject`**

In `scan.ts`, find the two places that call `detectProject(...)`:

```ts
  const rootProject = detectProject(rootInput);
```
and
```ts
    const subProject = detectProject(ws.root);
```

Replace them with:

```ts
  const rootProject = detectProject(rootInput, {
    svelteMajorOverride: options.svelteMajorOverride,
  });
```
and
```ts
    const subProject = detectProject(ws.root, {
      svelteMajorOverride: options.svelteMajorOverride,
    });
```

- [ ] **Step 4: Run typecheck and tests**

Run: `pnpm --filter svelte-doctor-cli typecheck && pnpm --filter svelte-doctor-cli test`
Expected: typecheck passes; existing tests pass; new svelte4 rule tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/svelte-doctor/src/scan.ts
git commit -m "scan: select ESLint preset by (svelteMajor, framework); thread override"
```

---

## Task 11: Add `--svelte-version` CLI flag

**Files:**
- Modify: `packages/svelte-doctor/src/cli.ts`

- [ ] **Step 1: Extend `CliOptions`**

In `packages/svelte-doctor/src/cli.ts`, add a property to the existing `CliOptions` interface — after the `scope?` line:

```ts
  svelteVersion?: string;
```

- [ ] **Step 2: Register the option on the program**

In the `.action(...)` block, find this option:

```ts
    .option(
      "--scope <choice>",
      "skip the interactive prompt: recommended | all (use --watch / --json / -y to suppress prompt entirely)",
    )
```

Add another `.option` immediately after it (still chained before `.action`):

```ts
    .option(
      "--svelte-version <version>",
      "override detected Svelte major version: 4 or 5",
    )
```

- [ ] **Step 3: Validate and convert in the action handler**

Inside the `.action(async (directory, opts)...)` body, near the existing `--scope` validation, add right after that block:

```ts
          let svelteMajorOverride: 4 | 5 | undefined;
          if (opts.svelteVersion !== undefined) {
            if (opts.svelteVersion !== "4" && opts.svelteVersion !== "5") {
              throw new SvelteDoctorError(
                `--svelte-version must be 4 or 5 (got "${opts.svelteVersion}")`,
                { hint: "Use --svelte-version 4 or --svelte-version 5." },
              );
            }
            svelteMajorOverride = opts.svelteVersion === "4" ? 4 : 5;
          }
```

- [ ] **Step 4: Pass override into `runOnce`**

Change `runOnce`'s signature to accept the override. Replace the existing `runOnce` declaration with:

```ts
async function runOnce(
  directory: string,
  opts: CliOptions,
  enabledRuleIds: string[] | null = null,
  svelteMajorOverride: 4 | 5 | undefined = undefined,
): Promise<DiagnoseResult> {
```

Inside `runOnce`, in the `scan(directory, { ... })` call, add the field:

```ts
    const result = await scan(directory, {
      lint: opts.lint,
      deadCode: opts.deadCode,
      diff: diffOption,
      project: opts.project,
      svelteMajorOverride,
      configOverrides: {
        respectInlineDisables: opts.respectInlineDisables,
        ...(scopeIgnore ? { ignore: scopeIgnore } : {}),
      },
      onStage: (stage) => {
        if (spin) spin.text = STAGE_LABELS[stage] ?? "Working…";
      },
    });
```

- [ ] **Step 5: Update the two call sites of `runOnce`**

In the same `.action` body, change:

```ts
              (dir, o) => runOnce(dir, o, enabledRuleIds),
```
to
```ts
              (dir, o) => runOnce(dir, o, enabledRuleIds, svelteMajorOverride),
```

And change:

```ts
          const result = await runOnce(directory, opts, enabledRuleIds);
```
to
```ts
          const result = await runOnce(directory, opts, enabledRuleIds, svelteMajorOverride);
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter svelte-doctor-cli typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/svelte-doctor/src/cli.ts
git commit -m "cli: add --svelte-version <4|5> override flag"
```

---

## Task 12: Banner — show major and source

**Files:**
- Modify: `packages/svelte-doctor/src/utils/banner.ts`

- [ ] **Step 1: Replace meta line**

In `packages/svelte-doctor/src/utils/banner.ts`, find the second `meta.push(...)` call inside `buildLines`:

```ts
  meta.push(
    `${project.framework} · svelte ${project.svelteVersion ?? "?"}${
      project.hasTypeScript ? pc.dim(" · ts") : ""
    }`,
  );
```

Replace with:

```ts
  meta.push(
    `${project.framework} · ${formatSvelteVersion(project)}${
      project.hasTypeScript ? pc.dim(" · ts") : ""
    }`,
  );
```

- [ ] **Step 2: Add formatter helper**

Add this function above `buildLines`:

```ts
function formatSvelteVersion(project: ProjectInfo): string {
  const base = `svelte ${project.svelteMajor}`;
  const runes = project.svelteMajor === 5 ? " (runes)" : "";
  if (project.svelteVersionSource === "override") return `${base}${runes} (forced)`;
  if (project.svelteVersionSource === "node_modules") {
    return `${base}${runes} (resolved from node_modules)`;
  }
  if (project.svelteVersionSource === "assumed") {
    return `${base}${runes} (assumed)`;
  }
  return `${base}${runes}`;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter svelte-doctor-cli typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/svelte-doctor/src/utils/banner.ts
git commit -m "banner: show svelte major + version source in CLI header"
```

---

## Task 13: Integration test — `svelte4` preset is selected for Svelte 4 fixture

**Files:**
- Create: `packages/svelte-doctor/tests/rules/svelte4/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/svelte-doctor/tests/rules/svelte4/integration.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scan } from "../../../src/scan.js";

let cwd: string;

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "svelte-doctor-svelte4-int-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("svelte4 preset integration", () => {
  it("fires svelte4 rules on a Svelte 4 project and not the rune rules", async () => {
    writeJson(join(cwd, "package.json"), {
      name: "fixture",
      type: "module",
      dependencies: { svelte: "^4.2.0", vite: "^4.0.0" },
    });
    mkdirSync(join(cwd, "src"));
    writeFileSync(
      join(cwd, "src", "Component.svelte"),
      `<script>
  import { onMount } from 'svelte';
  export let user;
  onMount(() => { fetch('/api/' + user.id); });
  user.name = 'x';
</script>
`,
    );

    const result = await scan(cwd, { deadCode: false });

    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(result.project.svelteMajor).toBe(4);
    expect(ruleIds).toContain("svelte-doctor-cli/no-fetch-in-onMount");
    expect(ruleIds).toContain("svelte-doctor-cli/no-mutation-of-export-let");
    expect(ruleIds).not.toContain("svelte-doctor-cli/no-fetch-in-effect");
    expect(ruleIds).not.toContain("svelte-doctor-cli/no-mutation-of-props");
  });

  it("respects --svelte-version override (Svelte 5 pkg + override 4)", async () => {
    writeJson(join(cwd, "package.json"), {
      name: "fixture",
      type: "module",
      dependencies: { svelte: "^5.0.0", vite: "^5.0.0" },
    });
    mkdirSync(join(cwd, "src"));
    writeFileSync(
      join(cwd, "src", "Component.svelte"),
      `<script>
  export let user;
  user.name = 'x';
</script>
`,
    );

    const result = await scan(cwd, {
      deadCode: false,
      svelteMajorOverride: 4,
    });

    expect(result.project.svelteMajor).toBe(4);
    expect(result.project.svelteVersionSource).toBe("override");
    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(ruleIds).toContain("svelte-doctor-cli/no-mutation-of-export-let");
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm --filter svelte-doctor-cli test -- integration`
Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/svelte-doctor/tests/rules/svelte4/integration.test.ts
git commit -m "test(svelte4): integration — preset switches by svelte major and override"
```

---

## Task 14: package.json — peer range, keyword, version bump

**Files:**
- Modify: `packages/svelte-doctor/package.json`

- [ ] **Step 1: Bump version, widen peer, add keyword**

Edit `packages/svelte-doctor/package.json`:

- Change `"version": "0.1.0"` to `"version": "0.2.0"`.
- Change `"svelte": "^5.0.0"` (under `peerDependencies`) to `"svelte": "^4.0.0 || ^5.0.0"`.
- In the `keywords` array, after `"svelte5"`, add `"svelte4"`.

- [ ] **Step 2: Verify typecheck and full test suite**

Run: `pnpm --filter svelte-doctor-cli typecheck && pnpm --filter svelte-doctor-cli test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add packages/svelte-doctor/package.json
git commit -m "chore: bump to 0.2.0, widen svelte peer to ^4||^5, add svelte4 keyword"
```

---

## Task 15: Rule docs

**Files:**
- Create: `packages/svelte-doctor/docs/rules/no-fetch-in-onMount.md`
- Create: `packages/svelte-doctor/docs/rules/no-mutation-of-export-let.md`
- Create: `packages/svelte-doctor/docs/rules/prefer-reactive-statement.md`
- Create: `packages/svelte-doctor/docs/rules/no-leaked-subscriptions.md`

- [ ] **Step 1: Check existing docs format**

Look at one existing file for the format to mirror:

Run: `ls packages/svelte-doctor/docs/rules/ && cat packages/svelte-doctor/docs/rules/no-fetch-in-effect.md`
Expected: list of `.md` files; output of one. Use that template.

- [ ] **Step 2: Create the four docs**

Create `packages/svelte-doctor/docs/rules/no-fetch-in-onMount.md`:

```markdown
# no-fetch-in-onMount

**Category:** state-effects
**Severity:** error
**Versions:** Svelte 4

## Why

`onMount` fires on the client only. A `fetch()` inside it forces the user to wait after hydration, blocks SSR data, and runs again on every navigation that re-mounts the component. In SvelteKit you should fetch in a `+page.ts` / `+page.server.ts` `load` function so the request happens during navigation and benefits from data preloading.

## Bad

```svelte
<script>
  import { onMount } from 'svelte';
  let data;
  onMount(() => { fetch('/api/items').then(r => r.json()).then(d => data = d); });
</script>
```

## Good

```ts
// +page.ts
export const load = async ({ fetch }) => {
  const r = await fetch('/api/items');
  return { items: await r.json() };
};
```

## Suppress

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-fetch-in-onMount
  onMount(() => fetch('/api/legacy'));
</script>
```
```

Create `packages/svelte-doctor/docs/rules/no-mutation-of-export-let.md`:

```markdown
# no-mutation-of-export-let

**Category:** state-effects
**Severity:** error
**Versions:** Svelte 4

## Why

In Svelte 4, `export let` declares a prop. Reassigning it inside the component breaks one-way data flow: the parent owns the value, and writing to it locally either silently de-syncs from the parent or triggers a `bind:` round-trip the parent didn't sign up for.

## Bad

```svelte
<script>
  export let count;
  function increment() { count++; }
</script>
```

## Good — emit a callback

```svelte
<script>
  export let count;
  export let onIncrement;
</script>

<button on:click={() => onIncrement?.()}>+</button>
```

## Good — use `bind:` (parent opts in)

```svelte
<!-- Parent.svelte -->
<Counter bind:count />
```

## Suppress

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-mutation-of-export-let
  export let count;
  count = 0;
</script>
```
```

Create `packages/svelte-doctor/docs/rules/prefer-reactive-statement.md`:

```markdown
# prefer-reactive-statement

**Category:** state-effects
**Severity:** warning
**Versions:** Svelte 4

## Why

A plain `let foo = expr` in `<script>` runs once at component setup. If `expr` references a prop, `foo` will not update when the prop changes. `$: foo = expr` re-runs whenever its dependencies change.

## Bad

```svelte
<script>
  export let count;
  let doubled = count * 2;
</script>

<p>{doubled}</p>
```

## Good

```svelte
<script>
  export let count;
  $: doubled = count * 2;
</script>

<p>{doubled}</p>
```

## Suppress

```svelte
<script>
  export let count;
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/prefer-reactive-statement
  let snapshot = count;
</script>
```
```

Create `packages/svelte-doctor/docs/rules/no-leaked-subscriptions.md`:

```markdown
# no-leaked-subscriptions

**Category:** state-effects
**Severity:** warning
**Versions:** Svelte 4

## Why

Anything subscribed or attached inside `onMount` lives until the component unmounts. Without a cleanup, you leak memory, double-fire callbacks after re-mounts, and accumulate event listeners.

## Bad

```svelte
<script>
  import { onMount } from 'svelte';
  import { count } from './store.js';
  onMount(() => { count.subscribe(v => console.log(v)); });
</script>
```

## Good

```svelte
<script>
  import { onMount } from 'svelte';
  import { count } from './store.js';
  onMount(() => {
    const unsubscribe = count.subscribe(v => console.log(v));
    return () => unsubscribe();
  });
</script>
```

## Suppress

```svelte
<script>
  // svelte-doctor-cli-disable-next-line svelte-doctor-cli/no-leaked-subscriptions
  onMount(() => store.subscribe(handle));
</script>
```
```

- [ ] **Step 3: Commit**

```bash
git add packages/svelte-doctor/docs/rules/no-fetch-in-onMount.md \
        packages/svelte-doctor/docs/rules/no-mutation-of-export-let.md \
        packages/svelte-doctor/docs/rules/prefer-reactive-statement.md \
        packages/svelte-doctor/docs/rules/no-leaked-subscriptions.md
git commit -m "docs(rules): add four svelte4 rule docs"
```

---

## Task 16: scope test for `--svelte-version`

**Files:**
- Modify: `packages/svelte-doctor/tests/scope.test.ts`

- [ ] **Step 1: Inspect existing scope.test.ts**

Run: `cat packages/svelte-doctor/tests/scope.test.ts`
Expected: see how the existing tests construct `scan` calls.

- [ ] **Step 2: Add an `it` block that asserts override behavior**

Append a new `it(...)` to the existing `describe` (or add a new `describe`) in `packages/svelte-doctor/tests/scope.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "svelte-doctor-scope-svelte-version-"));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("--svelte-version override", () => {
  it("forces svelte4 preset on a Svelte 5 project", async () => {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        name: "fixture",
        type: "module",
        dependencies: { svelte: "^5.0.0", vite: "^5.0.0" },
      }),
    );
    mkdirSync(join(cwd, "src"));
    writeFileSync(
      join(cwd, "src", "App.svelte"),
      `<script>
  export let name;
  name = 'x';
</script>
`,
    );

    const result = await scan(cwd, {
      deadCode: false,
      svelteMajorOverride: 4,
    });

    expect(result.project.svelteMajor).toBe(4);
    expect(result.project.svelteVersionSource).toBe("override");
    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(ruleIds).toContain("svelte-doctor-cli/no-mutation-of-export-let");
  });
});
```

If the existing file already imports the same helpers, append the new `describe` block instead of duplicating imports — the engineer should reconcile imports to keep the file syntactically valid.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter svelte-doctor-cli test -- scope`
Expected: existing tests + new test pass.

- [ ] **Step 4: Commit**

```bash
git add packages/svelte-doctor/tests/scope.test.ts
git commit -m "test(scope): --svelte-version override forces svelte4 preset"
```

---

## Task 17: README updates

**Files:**
- Modify: `README.md` (repo root)
- Modify: `packages/svelte-doctor/README.md`

The repo root README and the package README are kept in sync (the prepublish script copies, but check both — see existing layout).

- [ ] **Step 1: Compare both README files**

Run: `diff README.md packages/svelte-doctor/README.md || true`
Expected: small or no diff. If identical, edit both with the same content; otherwise edit each appropriately.

- [ ] **Step 2: Update tagline**

In both READMEs, replace:

```
One command scans your codebase and outputs a **0–100 health score** with actionable diagnostics across state & effects, performance, architecture, security, accessibility, and dead code. Works with **Svelte 5 (runes)** in **SvelteKit** and **Vite + Svelte** projects.
```

with:

```
One command scans your codebase and outputs a **0–100 health score** with actionable diagnostics across state & effects, performance, architecture, security, accessibility, and dead code. Works with **Svelte 4** and **Svelte 5 (runes)** in **SvelteKit** and **Vite + Svelte** projects.
```

- [ ] **Step 3: Update the rules table**

Replace the existing Rules table with the same columns plus `Versions`:

```markdown
| Rule                                      | Category       | Default | Versions |
| ----------------------------------------- | -------------- | ------- | -------- |
| `no-fetch-in-effect`                      | state-effects  | error   | 5        |
| `prefer-derived-over-effect`              | state-effects  | warn    | 5        |
| `no-mutation-of-props`                    | state-effects  | error   | 5        |
| `no-effect-without-cleanup`               | state-effects  | warn    | 5        |
| `no-cascading-state-in-effect`            | state-effects  | warn    | 5        |
| `no-circular-reactivity`                  | state-effects  | warn    | 5        |
| `no-fetch-in-onMount`                     | state-effects  | error   | 4        |
| `no-mutation-of-export-let`               | state-effects  | error   | 4        |
| `prefer-reactive-statement`               | state-effects  | warn    | 4        |
| `no-leaked-subscriptions`                 | state-effects  | warn    | 4        |
| `no-array-index-as-each-key`              | performance    | warn    | 4 & 5    |
| `no-unsafe-html-binding`                  | security       | error   | 4 & 5    |
| `no-href-javascript`                      | security       | error   | 4 & 5    |
| `component-too-large`                     | architecture   | warn    | 4 & 5    |
| `server-only-import-in-client` (SvelteKit) | security      | error   | 4 & 5    |
| `no-fetch-in-load-without-event` (SvelteKit) | performance | error   | 4 & 5    |
| `unused-disable-directive`                | meta           | warn    | 4 & 5    |
```

- [ ] **Step 4: Document `--svelte-version`**

In the CLI section, after the `--watch` option line, add:

```
  --svelte-version <4|5>     override detected Svelte major version
```

- [ ] **Step 5: Add FAQ entry**

Add a new section after the "How the score is calculated" block, before "License":

```markdown
## Which rules run on which version?

`svelte-doctor` detects your Svelte major version from `package.json` (falling back to `node_modules/svelte/package.json`, then to Svelte 5 if neither resolves). Rune-specific rules (`$effect`, `$state`, `$props`) run on Svelte 5; legacy-syntax rules (`onMount`, `export let`, `$:`) run on Svelte 4. Universal rules (security, performance, architecture, SvelteKit-specific) run on both. Pass `--svelte-version 4` or `--svelte-version 5` to override detection.
```

- [ ] **Step 6: Commit**

```bash
git add README.md packages/svelte-doctor/README.md
git commit -m "docs(readme): document Svelte 4 support, --svelte-version flag, rule versions"
```

---

## Task 18: Final verification

- [ ] **Step 1: Run full pipeline**

Run: `pnpm --filter svelte-doctor-cli typecheck && pnpm --filter svelte-doctor-cli build && pnpm --filter svelte-doctor-cli test`
Expected: all green.

- [ ] **Step 2: Smoke test against a Svelte 4 fixture**

Run inline:

```bash
TMP=$(mktemp -d) && \
  printf '%s' '{"name":"fixture","type":"module","dependencies":{"svelte":"^4.2.0","vite":"^4.0.0"}}' > "$TMP/package.json" && \
  mkdir -p "$TMP/src" && \
  printf '%s' '<script>
  import { onMount } from "svelte";
  export let user;
  onMount(() => { fetch("/api/" + user.id); });
  user.name = "x";
</script>' > "$TMP/src/Component.svelte" && \
  node packages/svelte-doctor/dist/cli.js "$TMP" --no-dead-code --json --json-compact | head -c 600
```

Expected: JSON output with `"svelteMajor":4`, `"svelteVersionSource":"package.json"`, and diagnostics including `svelte-doctor-cli/no-fetch-in-onMount` and `svelte-doctor-cli/no-mutation-of-export-let`.

- [ ] **Step 3: Smoke test the override**

Run inline:

```bash
node packages/svelte-doctor/dist/cli.js "$TMP" --no-dead-code --json --json-compact --svelte-version 5 | head -c 600
```

Expected: JSON output with `"svelteMajor":5`, `"svelteVersionSource":"override"`, diagnostics now contain rune-rules instead (or a parser error if syntax is illegal under runes — that's fine, it proves the preset switched).

- [ ] **Step 4: No further commit unless something failed**

If everything passed, the work is done. If a step failed, fix the offending file and add a tagged commit explaining the fix.

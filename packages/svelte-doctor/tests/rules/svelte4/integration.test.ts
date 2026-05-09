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

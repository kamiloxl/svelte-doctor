import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { rule } from "../../src/plugin/rules/svelte5/no-effect-without-cleanup.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-effect-without-cleanup", () => {
  it("validates fixtures", () => {
    tester.run("no-effect-without-cleanup", rule, {
      valid: [
        {
          code: "$effect(() => { const t = setInterval(tick, 1000); return () => clearInterval(t); });",
        },
        {
          code: "$effect(() => { window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); });",
        },
        { code: "$effect(() => { console.log('no listener'); });" },
        {
          code: "$effect(() => { const id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id); });",
        },
        {
          code: "$effect(() => { const ws = new WebSocket('wss://x'); return () => ws.close(); });",
        },
        {
          code: "$effect(() => { const ac = new AbortController(); fetch('/x', { signal: ac.signal }); return () => ac.abort(); });",
        },
      ],
      invalid: [
        {
          code: "$effect(() => { setInterval(tick, 1000); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "$effect(() => { requestAnimationFrame(loop); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "$effect(() => { new WebSocket('wss://x'); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "$effect(() => { new ResizeObserver(() => {}).observe(el); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "$effect(() => { new MutationObserver(() => {}).observe(node); });",
          errors: [{ messageId: "missingCleanup" }],
        },
        {
          code: "$effect(() => { store.subscribe((v) => console.log(v)); });",
          errors: [{ messageId: "missingCleanup" }],
        },
      ],
    });
  });
});

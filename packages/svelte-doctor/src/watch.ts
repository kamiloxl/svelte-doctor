import { watch } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import type { DiagnoseResult } from "./types.js";

const DEBOUNCE_MS = 250;
const WATCH_EXTENSIONS = new Set([
  ".svelte",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

export async function runWatch<O>(
  directory: string,
  opts: O,
  runOnce: (dir: string, opts: O) => Promise<DiagnoseResult>,
  renderResult: (result: DiagnoseResult, opts: O) => string,
): Promise<void> {
  const root = resolve(directory);

  let scanning = false;
  let pending = false;
  let timer: NodeJS.Timeout | null = null;

  const scanAndRender = async () => {
    scanning = true;
    pending = false;
    process.stdout.write("\x1Bc");
    try {
      const result = await runOnce(directory, opts);
      const text = renderResult(result, opts);
      if (text) process.stdout.write(`${text}\n\n`);
      process.stdout.write(pc.dim("Watching for changes… (Ctrl+C to exit)\n"));
    } catch (err) {
      process.stdout.write(`${pc.red("Scan failed:")} ${(err as Error).message}\n`);
    } finally {
      scanning = false;
      if (pending) scheduleScan();
    }
  };

  const scheduleScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (scanning) {
        pending = true;
        return;
      }
      void scanAndRender();
    }, DEBOUNCE_MS);
  };

  await scanAndRender();

  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (filename.includes("node_modules")) return;
    if (filename.includes(".git/")) return;
    const dot = filename.lastIndexOf(".");
    if (dot < 0) return;
    if (!WATCH_EXTENSIONS.has(filename.slice(dot))) return;
    scheduleScan();
  });

  await new Promise<void>((resolvePromise) => {
    process.on("SIGINT", () => {
      watcher.close();
      resolvePromise();
    });
  });
}

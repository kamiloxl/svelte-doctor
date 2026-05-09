import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { minimatch } from "minimatch";

interface GitAttributesEntry {
  pattern: string;
  attributes: Map<string, string | boolean>;
}

const VENDORED_KEYS = ["linguist-vendored", "linguist-generated"];

function parseAttributes(tokens: string[]): Map<string, string | boolean> {
  const attrs = new Map<string, string | boolean>();
  for (const token of tokens) {
    if (token.startsWith("-")) {
      attrs.set(token.slice(1), false);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq < 0) {
      attrs.set(token, true);
    } else {
      attrs.set(token.slice(0, eq), token.slice(eq + 1));
    }
  }
  return attrs;
}

export function readGitAttributes(root: string): GitAttributesEntry[] {
  const path = join(root, ".gitattributes");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const entries: GitAttributesEntry[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const [pattern, ...attrTokens] = tokens;
    entries.push({ pattern, attributes: parseAttributes(attrTokens) });
  }
  return entries;
}

function attributeMeansVendored(value: string | boolean): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value !== "string") return false;
  return value !== "false" && value !== "unset";
}

export function isPathVendoredOrGenerated(
  relPath: string,
  entries: readonly GitAttributesEntry[],
): boolean {
  let result = false;
  const normalized = relPath.replace(/\\/g, "/");
  for (const entry of entries) {
    const matched = minimatch(normalized, entry.pattern, {
      matchBase: !entry.pattern.includes("/"),
      dot: true,
    });
    if (!matched) continue;
    for (const key of VENDORED_KEYS) {
      const value = entry.attributes.get(key);
      if (value === undefined) continue;
      result = attributeMeansVendored(value);
    }
  }
  return result;
}

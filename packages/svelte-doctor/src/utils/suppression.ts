import { SUPPRESSION_DIRECTIVE, SUPPRESSION_NEAR_MISS_MAX_LINES } from "../constants.js";
import type { Diagnostic } from "../types.js";

const LINE_PATTERNS = [
  /\/\/\s*svelte-doctor-cli-disable-next-line\s+([^\n]+)/g,
  /<!--\s*svelte-doctor-cli-disable-next-line\s+([^>]+?)\s*-->/g,
  /\/\*\s*svelte-doctor-cli-disable-next-line\s+([^*]+?)\s*\*\//g,
];

const COMMENT_LIKE_LINE = /^\s*(?:\/\/|<!--|\/\*)/;
const TAG_OPENING = /^\s*<[A-Za-z]/;
const TAG_CLOSE_AT_END = /(?:\/?>)\s*$/;
const NEW_TAG_OPENING_INSIDE = /<[A-Za-z]/;
const MAX_TAG_SPAN_LINES = 32;

export interface SuppressionEntry {
  lineOfComment: number; // 1-based
  ruleIds: Set<string>;
  rawRuleList: string;
}

export interface SuppressionStack {
  comments: SuppressionEntry[];
  appliesToLines: Set<number>; // 1-based
  combinedRuleIds: Set<string>;
  combinedRawList: string;
  firstCommentLine: number;
  lastCommentLine: number;
  used: boolean;
}

function parseRuleList(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function findSuppressionsInSource(source: string): SuppressionEntry[] {
  const entries: SuppressionEntry[] = [];
  for (const regex of LINE_PATTERNS) {
    for (const match of source.matchAll(regex)) {
      const before = source.slice(0, match.index);
      const lineOfComment = before.split(/\r?\n/).length;
      entries.push({
        lineOfComment,
        ruleIds: parseRuleList(match[1]),
        rawRuleList: match[1].trim(),
      });
    }
  }
  return entries.sort((a, b) => a.lineOfComment - b.lineOfComment);
}

function expandTagSpan(lines: string[], startLineOneBased: number): Set<number> {
  const applies = new Set<number>([startLineOneBased]);
  const startIdx = startLineOneBased - 1;
  if (startIdx < 0 || startIdx >= lines.length) return applies;
  const startLine = lines[startIdx];
  if (!TAG_OPENING.test(startLine)) return applies;
  if (TAG_CLOSE_AT_END.test(startLine.trimEnd())) return applies;
  for (
    let i = startIdx + 1;
    i < lines.length && i < startIdx + MAX_TAG_SPAN_LINES;
    i++
  ) {
    applies.add(i + 1);
    const trimmed = lines[i].trimEnd();
    if (i > startIdx && NEW_TAG_OPENING_INSIDE.test(trimmed)) break;
    if (TAG_CLOSE_AT_END.test(trimmed)) break;
  }
  return applies;
}

export function buildStacks(source: string): SuppressionStack[] {
  const entries = findSuppressionsInSource(source);
  if (!entries.length) return [];
  const lines = source.split(/\r?\n/);
  const stacks: SuppressionStack[] = [];
  let current: SuppressionEntry[] = [];

  const flush = () => {
    if (!current.length) return;
    const last = current[current.length - 1];
    const startLine = last.lineOfComment + 1;
    const appliesToLines = expandTagSpan(lines, startLine);
    const combinedRuleIds = new Set<string>();
    const rawParts: string[] = [];
    for (const e of current) {
      for (const r of e.ruleIds) combinedRuleIds.add(r);
      if (e.rawRuleList) rawParts.push(e.rawRuleList);
    }
    stacks.push({
      comments: [...current],
      appliesToLines,
      combinedRuleIds,
      combinedRawList: rawParts.join(", "),
      firstCommentLine: current[0].lineOfComment,
      lastCommentLine: last.lineOfComment,
      used: false,
    });
    current = [];
  };

  for (const entry of entries) {
    if (!current.length) {
      current.push(entry);
      continue;
    }
    const prev = current[current.length - 1];
    const adjacentInChain =
      entry.lineOfComment === prev.lineOfComment + 1 &&
      COMMENT_LIKE_LINE.test(lines[entry.lineOfComment - 1] ?? "");
    if (adjacentInChain) {
      current.push(entry);
    } else {
      flush();
      current.push(entry);
    }
  }
  flush();
  return stacks;
}

function ruleMatchesStack(stack: SuppressionStack, ruleId: string): boolean {
  if (stack.combinedRuleIds.has(ruleId)) return true;
  const bare = ruleId.includes("/") ? ruleId.split("/")[1] : ruleId;
  return stack.combinedRuleIds.has(bare);
}

function lastAppliesLine(stack: SuppressionStack): number {
  let max = -Infinity;
  for (const n of stack.appliesToLines) if (n > max) max = n;
  return max;
}

function buildGapHint(stack: SuppressionStack, diagnostic: Diagnostic): string {
  const gap = diagnostic.line - lastAppliesLine(stack);
  return `A ${SUPPRESSION_DIRECTIVE} for ${diagnostic.ruleId} sits at line ${stack.lastCommentLine}, but ${gap} line${gap === 1 ? "" : "s"} of code separate it from the diagnostic on line ${diagnostic.line}. Move the comment immediately above line ${diagnostic.line}.`;
}

function buildMismatchHint(stack: SuppressionStack, diagnostic: Diagnostic): string {
  return `An adjacent ${SUPPRESSION_DIRECTIVE} at line ${stack.lastCommentLine} lists "${stack.combinedRawList}" — ${diagnostic.ruleId} is not in that list. Use the comma form: ${SUPPRESSION_DIRECTIVE} ${stack.combinedRawList}, ${diagnostic.ruleId}`;
}

function findNearMissStack(
  stacks: SuppressionStack[],
  diagnostic: Diagnostic,
): { stack: SuppressionStack; hint: string } | null {
  for (const stack of stacks) {
    if (!stack.appliesToLines.has(diagnostic.line)) continue;
    if (ruleMatchesStack(stack, diagnostic.ruleId)) continue;
    if (!stack.combinedRawList) continue;
    return { stack, hint: buildMismatchHint(stack, diagnostic) };
  }
  let best: { stack: SuppressionStack; gap: number } | null = null;
  for (const stack of stacks) {
    if (!ruleMatchesStack(stack, diagnostic.ruleId)) continue;
    const gap = diagnostic.line - lastAppliesLine(stack);
    if (gap <= 0 || gap > SUPPRESSION_NEAR_MISS_MAX_LINES) continue;
    if (!best || gap < best.gap) best = { stack, gap };
  }
  if (!best) return null;
  return { stack: best.stack, hint: buildGapHint(best.stack, diagnostic) };
}

export interface SuppressionApplyResult {
  diagnostics: Diagnostic[];
  unusedDisables: Diagnostic[];
}

export function applySuppressionsAndDetectUnused(
  diagnostics: Diagnostic[],
  fileSources: Map<string, string>,
): SuppressionApplyResult {
  const stacksByFile = new Map<string, SuppressionStack[]>();

  const stacksFor = (file: string): SuppressionStack[] => {
    let stacks = stacksByFile.get(file);
    if (!stacks) {
      const source = fileSources.get(file);
      stacks = source ? buildStacks(source) : [];
      stacksByFile.set(file, stacks);
    }
    return stacks;
  };

  for (const file of fileSources.keys()) stacksFor(file);

  const remaining: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const stacks = stacksFor(diagnostic.file);
    const suppressing = stacks.find(
      (s) =>
        s.appliesToLines.has(diagnostic.line) &&
        ruleMatchesStack(s, diagnostic.ruleId),
    );
    if (suppressing) {
      suppressing.used = true;
      continue;
    }
    const nearMiss = findNearMissStack(stacks, diagnostic);
    if (nearMiss) {
      nearMiss.stack.used = true;
      remaining.push({ ...diagnostic, suppressionHint: nearMiss.hint });
    } else {
      remaining.push(diagnostic);
    }
  }

  const unusedDisables: Diagnostic[] = [];
  for (const [file, stacks] of stacksByFile) {
    for (const stack of stacks) {
      if (stack.used) continue;
      unusedDisables.push({
        ruleId: "svelte-doctor-cli/unused-disable-directive",
        category: "architecture",
        severity: "warning",
        message: `Unused suppression directive for "${stack.combinedRawList}" — no diagnostic at line ${[...stack.appliesToLines].sort((a, b) => a - b).join(", ")} matches.`,
        file,
        line: stack.firstCommentLine,
        column: 1,
      });
    }
  }

  return { diagnostics: remaining, unusedDisables };
}

/** @deprecated thin wrapper kept for tests; new code should use applySuppressionsAndDetectUnused */
export function applySuppressions(
  diagnostics: Diagnostic[],
  fileSources: Map<string, string>,
): Diagnostic[] {
  return applySuppressionsAndDetectUnused(diagnostics, fileSources).diagnostics;
}

export const _internal = {
  buildStacks,
  expandTagSpan,
  findSuppressionsInSource,
  parseRuleList,
  SUPPRESSION_DIRECTIVE,
};

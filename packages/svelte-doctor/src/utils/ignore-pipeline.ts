import { relative } from "node:path";
import { minimatch } from "minimatch";
import {
  BUILTIN_IGNORED_DIRECTORIES,
  RULE_PREFIX,
} from "../constants.js";
import { isPathVendoredOrGenerated, readGitAttributes } from "./gitattributes.js";
import type { Diagnostic, IgnoreOverride } from "../types.js";

export interface IgnorePipelineOptions {
  projectRoot: string;
  ignoreFiles: string[];
  ignoreOverrides: IgnoreOverride[];
}

export interface IgnorePipeline {
  filter(diagnostic: Diagnostic): boolean;
  isPathIgnored(absolutePath: string): boolean;
}

function bareRule(ruleId: string): string {
  return ruleId.startsWith(`${RULE_PREFIX}/`)
    ? ruleId.slice(RULE_PREFIX.length + 1)
    : ruleId;
}

function ruleListIncludes(rules: readonly string[], ruleId: string): boolean {
  if (rules.includes(ruleId)) return true;
  return rules.includes(bareRule(ruleId));
}

function pathInIgnoredDirectory(rel: string): boolean {
  const segments = rel.split("/");
  for (const segment of segments) {
    if (BUILTIN_IGNORED_DIRECTORIES.includes(segment)) return true;
  }
  return false;
}

function matchesAny(rel: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    minimatch(rel, pattern, { dot: true, matchBase: !pattern.includes("/") }),
  );
}

export function createIgnorePipeline(
  options: IgnorePipelineOptions,
): IgnorePipeline {
  const gitAttributes = readGitAttributes(options.projectRoot);

  const toRel = (absolutePath: string): string =>
    relative(options.projectRoot, absolutePath).replace(/\\/g, "/");

  const isPathIgnored = (absolutePath: string): boolean => {
    const rel = toRel(absolutePath);
    if (pathInIgnoredDirectory(rel)) return true;
    if (isPathVendoredOrGenerated(rel, gitAttributes)) return true;
    if (matchesAny(rel, options.ignoreFiles)) return true;
    return false;
  };

  const filter = (diagnostic: Diagnostic): boolean => {
    const rel = toRel(diagnostic.file);
    if (pathInIgnoredDirectory(rel)) return false;
    if (isPathVendoredOrGenerated(rel, gitAttributes)) return false;
    if (matchesAny(rel, options.ignoreFiles)) return false;
    for (const override of options.ignoreOverrides) {
      if (!matchesAny(rel, override.files)) continue;
      if (!override.rules || override.rules.length === 0) {
        return false;
      }
      if (ruleListIncludes(override.rules, diagnostic.ruleId)) {
        return false;
      }
    }
    return true;
  };

  return { filter, isPathIgnored };
}

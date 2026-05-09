import { DOCS_BASE_URL } from "../constants.js";
import type { Category, Severity } from "../types.js";

export interface RuleMeta {
  id: string;
  category: Category;
  defaultSeverity: Severity;
  description: string;
  docsUrl: string;
}

const REGISTRY = new Map<string, RuleMeta>();

type RuleMetaInput = Omit<RuleMeta, "docsUrl"> & { docsUrl?: string };

export function registerRuleMeta(meta: RuleMetaInput): RuleMeta {
  const fullMeta: RuleMeta = {
    ...meta,
    docsUrl: meta.docsUrl ?? `${DOCS_BASE_URL}/${meta.id}.md`,
  };
  REGISTRY.set(meta.id, fullMeta);
  return fullMeta;
}

export function getRuleMeta(id: string): RuleMeta | undefined {
  const bare = id.replace(/^svelte-doctor\//, "");
  return REGISTRY.get(bare);
}

export function allRuleMeta(): RuleMeta[] {
  return [...REGISTRY.values()];
}

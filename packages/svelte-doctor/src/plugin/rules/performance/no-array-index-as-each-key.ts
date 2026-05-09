import type { Rule } from "eslint";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-array-index-as-each-key";

registerRuleMeta({
  id: RULE_ID,
  category: "performance",
  defaultSeverity: "warning",
  description:
    "Disallow using the loop index as the key in `{#each}` blocks — defeats Svelte's keyed each and reorders DOM unpredictably.",
});

interface SvelteEachBlock {
  type: "SvelteEachBlock";
  index?: { type: "Identifier"; name: string } | null;
  key?: { type: "Identifier"; name: string } | null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow using the loop index as the key in {#each ... (key)}.",
      recommended: true,
    },
    schema: [],
    messages: {
      indexAsKey:
        "Do not use the each-block index as its key. Provide a stable identifier (e.g. item.id) instead.",
    },
  },
  create(context) {
    return {
      SvelteEachBlock(rawNode: unknown) {
        const node = rawNode as SvelteEachBlock;
        const index = node.index;
        const key = node.key;
        if (!index || !key) return;
        if (key.type !== "Identifier" || index.type !== "Identifier") return;
        if (index.name === key.name) {
          context.report({
            node: rawNode as Rule.Node,
            messageId: "indexAsKey",
          });
        }
      },
    } as Rule.RuleListener;
  },
};

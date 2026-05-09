import type { Rule } from "eslint";
import type { CallExpression, Node } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-fetch-in-effect";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "error",
  description:
    "Disallow `fetch(...)` calls inside `$effect(...)`. Use a SvelteKit load function or a top-level await with `{#await}` instead.",
});

function isFetchCall(node: CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier" && callee.name === "fetch") return true;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    callee.property.name === "fetch"
  ) {
    return true;
  }
  return false;
}

function isEffectCall(node: CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier" && callee.name === "$effect") return true;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "$effect" &&
    callee.property.type === "Identifier" &&
    (callee.property.name === "pre" || callee.property.name === "root")
  ) {
    return true;
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow fetch() inside $effect — prefer SvelteKit load functions or {#await}.",
      recommended: true,
    },
    schema: [],
    messages: {
      fetchInEffect:
        "Do not call fetch() inside $effect. Move the request to a SvelteKit load function or use {#await} with a top-level promise.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        if (!isFetchCall(node as unknown as CallExpression)) return;
        const ancestors = sourceCode.getAncestors(node) as Node[];
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const ancestor = ancestors[i];
          if (
            ancestor.type === "CallExpression" &&
            isEffectCall(ancestor as CallExpression)
          ) {
            context.report({
              node,
              messageId: "fetchInEffect",
            });
            return;
          }
        }
      },
    };
  },
};

export const ruleId = RULE_ID;

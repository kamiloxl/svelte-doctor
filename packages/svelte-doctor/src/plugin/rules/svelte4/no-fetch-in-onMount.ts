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

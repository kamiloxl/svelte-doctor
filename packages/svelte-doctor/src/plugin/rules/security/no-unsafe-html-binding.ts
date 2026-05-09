import type { Rule } from "eslint";
import type { Node } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-unsafe-html-binding";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "`{@html …}` is XSS-prone unless the value comes from a trusted sanitizer (DOMPurify, sanitize-html).",
});

const SAFE_CALLEES = new Set(["sanitize", "purify", "DOMPurify"]);

interface SvelteMustacheTagRaw {
  type: "SvelteMustacheTag";
  kind: "raw" | "text";
  expression: Node;
}

function expressionLooksSanitized(expression: Node): boolean {
  if (expression.type !== "CallExpression") return false;
  const callee = expression.callee;
  if (callee.type === "Identifier") return SAFE_CALLEES.has(callee.name);
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    SAFE_CALLEES.has(callee.property.name)
  ) {
    return true;
  }
  if (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    SAFE_CALLEES.has(callee.object.name)
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
        "Disallow {@html ...} unless the expression is the result of a known sanitizer.",
      recommended: true,
    },
    schema: [],
    messages: {
      unsafeHtml:
        "{@html} renders raw HTML and is XSS-prone. Pipe the value through a sanitizer (e.g. DOMPurify.sanitize) before rendering.",
    },
  },
  create(context) {
    return {
      SvelteMustacheTag(rawNode: unknown) {
        const node = rawNode as SvelteMustacheTagRaw;
        if (node.kind !== "raw") return;
        if (expressionLooksSanitized(node.expression)) return;
        context.report({
          node: rawNode as Rule.Node,
          messageId: "unsafeHtml",
        });
      },
    } as Rule.RuleListener;
  },
};

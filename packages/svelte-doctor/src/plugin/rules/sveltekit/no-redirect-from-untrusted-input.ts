import type { Rule } from "eslint";
import type { CallExpression, MemberExpression } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-redirect-from-untrusted-input";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "Calling `redirect(302, untrusted)` where `untrusted` derives from `url.searchParams`, `request.formData()`, or `cookies.get()` enables open-redirect / phishing.",
});

const TAINT_SOURCE_PROPERTIES = new Set([
  "searchParams",
  "search",
  "formData",
  "json",
  "text",
]);

function looksTainted(arg: unknown): boolean {
  if (!arg || typeof arg !== "object") return false;
  const node = arg as { type?: string };
  if (node.type === "AwaitExpression") {
    return looksTainted((node as unknown as { argument: unknown }).argument);
  }
  if (node.type === "CallExpression") {
    const ce = node as unknown as CallExpression;
    if (ce.callee.type === "MemberExpression") {
      const prop = (ce.callee as MemberExpression).property;
      if (
        prop.type === "Identifier" &&
        TAINT_SOURCE_PROPERTIES.has(prop.name)
      ) {
        return true;
      }
      if (prop.type === "Identifier" && prop.name === "get") {
        if (looksTainted((ce.callee as MemberExpression).object)) return true;
      }
    }
    return false;
  }
  if (node.type === "MemberExpression") {
    const me = node as unknown as MemberExpression;
    if (
      me.property.type === "Identifier" &&
      TAINT_SOURCE_PROPERTIES.has(me.property.name)
    ) {
      return true;
    }
    if (
      me.object.type === "Identifier" &&
      (me.object as { name: string }).name === "cookies"
    ) {
      return true;
    }
    return looksTainted(me.object);
  }
  if (node.type === "Identifier") {
    const name = (node as unknown as { name: string }).name;
    if (name === "cookies" || name === "searchParams") return true;
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow redirect()/throw redirect() with a destination derived from untrusted input.",
      recommended: true,
    },
    schema: [],
    messages: {
      taintedRedirect:
        "Redirect destination is derived from untrusted input ({{source}}). Whitelist allowed paths or validate that the URL is same-origin.",
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "redirect"
        ) {
          return;
        }
        const dest = node.arguments[1];
        if (!dest) return;
        if (looksTainted(dest)) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "taintedRedirect",
            data: { source: "url/cookies/formData" },
          });
        }
      },
    };
  },
};

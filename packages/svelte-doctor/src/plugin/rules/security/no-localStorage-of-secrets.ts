import type { Rule } from "eslint";
import type { CallExpression } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-localStorage-of-secrets";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "warning",
  description:
    "Storing tokens / credentials in `localStorage` or `sessionStorage` exposes them to any XSS. Use httpOnly cookies instead.",
});

const STORAGE_OBJECTS = new Set(["localStorage", "sessionStorage"]);
const SECRET_KEY = /\b(token|jwt|secret|credential|password|api[_-]?key|auth)\b/i;

function isStorageMember(callee: CallExpression["callee"]): boolean {
  if (callee.type !== "MemberExpression") return false;
  const obj = callee.object;
  if (obj.type === "Identifier" && STORAGE_OBJECTS.has(obj.name)) return true;
  if (
    obj.type === "MemberExpression" &&
    !obj.computed &&
    obj.property.type === "Identifier" &&
    STORAGE_OBJECTS.has(obj.property.name)
  ) {
    return true;
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow storing tokens or credentials in localStorage / sessionStorage.",
      recommended: true,
    },
    schema: [],
    messages: {
      secretInStorage:
        "`{{key}}` looks like a secret being written to {{storage}}. Use httpOnly cookies; localStorage is readable by any XSS.",
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        if (!isStorageMember(node.callee)) return;
        const callee = node.callee as { property: { type: string; name?: string }; object: unknown };
        if (
          callee.property.type !== "Identifier" ||
          callee.property.name !== "setItem"
        )
          return;
        const keyArg = node.arguments[0];
        if (!keyArg || keyArg.type !== "Literal" || typeof keyArg.value !== "string") {
          return;
        }
        if (!SECRET_KEY.test(keyArg.value)) return;
        const obj = (node.callee as { object: { type: string; name?: string; property?: { name?: string } } }).object;
        const storageName =
          obj.type === "Identifier"
            ? obj.name
            : obj.property?.name ?? "storage";
        context.report({
          node,
          messageId: "secretInStorage",
          data: { key: keyArg.value, storage: storageName ?? "storage" },
        });
      },
    };
  },
};

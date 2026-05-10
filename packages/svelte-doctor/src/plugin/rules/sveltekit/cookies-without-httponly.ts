import type { Rule } from "eslint";
import type { CallExpression, ObjectExpression, Property } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "cookies-without-httponly";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "warning",
  description:
    "`cookies.set(...)` for session/auth cookies should always be `httpOnly: true`, `secure: true`, and have an explicit `sameSite`.",
});

const SENSITIVE_COOKIE = /^(session|sid|auth|token|jwt|refresh|csrf)/i;

function findProperty(obj: ObjectExpression, name: string): Property | null {
  for (const p of obj.properties) {
    if (p.type !== "Property") continue;
    if (p.key.type === "Identifier" && p.key.name === name) return p;
    if (
      p.key.type === "Literal" &&
      typeof (p.key as { value: unknown }).value === "string" &&
      (p.key as { value: string }).value === name
    ) {
      return p;
    }
  }
  return null;
}

function literalValue(prop: Property | null): unknown {
  if (!prop) return undefined;
  if (prop.value.type !== "Literal") return undefined;
  return (prop.value as { value: unknown }).value;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require httpOnly + secure + sameSite on cookies.set for sensitive cookie names.",
      recommended: true,
    },
    schema: [],
    messages: {
      missingHttpOnly:
        "`cookies.set('{{name}}', ...)` should set `httpOnly: true` (auth/session cookies must not be readable from JavaScript).",
      explicitInsecure:
        "`cookies.set('{{name}}', { {{flag}}: false })` weakens cookie security. Remove the override unless this is a deliberate, audited choice.",
      missingSameSite:
        "`cookies.set('{{name}}', ...)` should set `sameSite: 'lax' | 'strict' | 'none'` to prevent CSRF.",
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (
          callee.property.type !== "Identifier" ||
          callee.property.name !== "set"
        ) {
          return;
        }
        if (
          callee.object.type !== "Identifier" ||
          callee.object.name !== "cookies"
        ) {
          return;
        }
        const [keyArg, , optsArg] = node.arguments;
        if (!keyArg || keyArg.type !== "Literal") return;
        const cookieName = (keyArg as { value: unknown }).value;
        if (typeof cookieName !== "string") return;
        if (!SENSITIVE_COOKIE.test(cookieName)) return;

        if (!optsArg || optsArg.type !== "ObjectExpression") {
          context.report({
            node,
            messageId: "missingHttpOnly",
            data: { name: cookieName },
          });
          return;
        }

        const obj = optsArg as ObjectExpression;
        const httpOnlyProp = findProperty(obj, "httpOnly");
        if (httpOnlyProp && literalValue(httpOnlyProp) === false) {
          context.report({
            node: httpOnlyProp as unknown as Rule.Node,
            messageId: "explicitInsecure",
            data: { name: cookieName, flag: "httpOnly" },
          });
        } else if (!httpOnlyProp || literalValue(httpOnlyProp) === undefined) {
          context.report({
            node,
            messageId: "missingHttpOnly",
            data: { name: cookieName },
          });
        }

        const secureProp = findProperty(obj, "secure");
        if (secureProp && literalValue(secureProp) === false) {
          context.report({
            node: secureProp as unknown as Rule.Node,
            messageId: "explicitInsecure",
            data: { name: cookieName, flag: "secure" },
          });
        }

        const sameSiteProp = findProperty(obj, "sameSite");
        if (!sameSiteProp) {
          context.report({
            node,
            messageId: "missingSameSite",
            data: { name: cookieName },
          });
        }
      },
    };
  },
};

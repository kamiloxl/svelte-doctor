import type { Rule } from "eslint";
import type { ArrayExpression, Property } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "weak-csp";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "warning",
  description:
    "Detects weak Content-Security-Policy directives (`unsafe-inline`, `unsafe-eval`, wildcard `*`) in `svelte.config.js` `kit.csp`.",
});

const SVELTE_CONFIG_FILENAME = /(?:^|\/)svelte\.config\.(?:js|ts|mjs|cjs)$/;
const DANGEROUS_TOKENS = new Set([
  "unsafe-inline",
  "unsafe-eval",
  "unsafe-hashes",
  "*",
]);

function propertyName(prop: Property): string | null {
  if (prop.key.type === "Identifier") return prop.key.name;
  if (
    prop.key.type === "Literal" &&
    typeof (prop.key as { value: unknown }).value === "string"
  ) {
    return (prop.key as { value: string }).value;
  }
  return null;
}

function ancestorPropertyChain(node: unknown): string[] {
  const chain: string[] = [];
  let cur = node as { parent?: unknown; type?: string } | null;
  while (cur) {
    if (cur.type === "Property") {
      const name = propertyName(cur as unknown as Property);
      if (name) chain.unshift(name);
    }
    cur = (cur as { parent?: { parent?: unknown; type?: string } }).parent ?? null;
  }
  return chain;
}

function isUnderCsp(node: unknown): boolean {
  return ancestorPropertyChain(node).includes("csp");
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on weak CSP tokens (unsafe-inline, unsafe-eval, *) in svelte.config.js kit.csp.",
      recommended: true,
    },
    schema: [],
    messages: {
      weakToken:
        "CSP directive contains `{{token}}` which weakens the policy. Prefer hash- or nonce-based sources.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!SVELTE_CONFIG_FILENAME.test(filename)) return {};

    return {
      ArrayExpression(node: ArrayExpression) {
        if (!isUnderCsp(node)) return;
        for (const el of node.elements) {
          if (!el) continue;
          if (el.type !== "Literal") continue;
          const value = (el as { value: unknown }).value;
          if (typeof value !== "string") continue;
          if (DANGEROUS_TOKENS.has(value)) {
            context.report({
              node: el as unknown as Rule.Node,
              messageId: "weakToken",
              data: { token: value },
            });
          }
        }
      },
    };
  },
};

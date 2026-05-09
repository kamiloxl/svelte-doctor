import type { Rule } from "eslint";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-href-javascript";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description: "Disallow `<a href=\"javascript:...\">` — XSS and a11y hazard.",
});

interface SvelteAttribute {
  type: "SvelteAttribute";
  key: { type: "SvelteName"; name: string };
  value: SvelteAttributeValue[];
}

interface SvelteLiteral {
  type: "SvelteLiteral";
  value: string;
}

type SvelteAttributeValue = SvelteLiteral | { type: string };

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow href values starting with javascript:.",
      recommended: true,
    },
    schema: [],
    messages: {
      hrefJavascript:
        "Avoid `href=\"javascript:...\"`. Use a button with an on:click handler or a real URL.",
    },
  },
  create(context) {
    return {
      SvelteAttribute(rawNode: unknown) {
        const node = rawNode as SvelteAttribute;
        if (node.key?.name !== "href") return;
        const literal = node.value.find(
          (v: SvelteAttributeValue): v is SvelteLiteral =>
            v.type === "SvelteLiteral",
        );
        if (!literal) return;
        if (literal.value.trim().toLowerCase().startsWith("javascript:")) {
          context.report({
            node: rawNode as Rule.Node,
            messageId: "hrefJavascript",
          });
        }
      },
    } as Rule.RuleListener;
  },
};

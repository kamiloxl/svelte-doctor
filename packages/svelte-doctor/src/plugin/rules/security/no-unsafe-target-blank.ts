import type { Rule } from "eslint";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-unsafe-target-blank";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "`<a target=\"_blank\">` without `rel=\"noopener noreferrer\"` lets the opened page hijack `window.opener` (reverse tabnabbing).",
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

interface SvelteElement {
  type: "SvelteElement";
  name: { type: string; name?: string };
  startTag: {
    attributes: SvelteAttribute[];
  };
}

function attrLiteralValue(attr: SvelteAttribute | undefined): string | null {
  if (!attr) return null;
  const literal = attr.value.find(
    (v: SvelteAttributeValue): v is SvelteLiteral => v.type === "SvelteLiteral",
  );
  return literal ? literal.value : null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Require rel="noopener noreferrer" on links with target="_blank".',
      recommended: true,
    },
    schema: [],
    messages: {
      missingRel:
        '`<a target="_blank">` must include `rel="noopener noreferrer"` to prevent reverse tabnabbing.',
    },
  },
  create(context) {
    return {
      SvelteElement(rawNode: unknown) {
        const node = rawNode as SvelteElement;
        if (node.name?.name !== "a") return;
        const attrs = node.startTag?.attributes ?? [];
        const targetAttr = attrs.find(
          (a) => a.type === "SvelteAttribute" && a.key?.name === "target",
        );
        const targetValue = attrLiteralValue(targetAttr);
        if (targetValue !== "_blank") return;
        const relAttr = attrs.find(
          (a) => a.type === "SvelteAttribute" && a.key?.name === "rel",
        );
        const relValue = attrLiteralValue(relAttr) ?? "";
        const tokens = relValue.split(/\s+/).filter(Boolean);
        const hasNoopener = tokens.includes("noopener");
        const hasNoreferrer = tokens.includes("noreferrer");
        if (!hasNoopener || !hasNoreferrer) {
          context.report({
            node: rawNode as Rule.Node,
            messageId: "missingRel",
          });
        }
      },
    } as Rule.RuleListener;
  },
};

import type { Rule } from "eslint";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "component-too-large";

registerRuleMeta({
  id: RULE_ID,
  category: "architecture",
  defaultSeverity: "warning",
  description:
    "Flag Svelte components that exceed a configurable line threshold — they tend to mix concerns and should be split.",
});

const DEFAULT_MAX_LINES = 300;

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when a .svelte component exceeds a configurable line count.",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          max: { type: "number", minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLarge:
        "Component is {{lines}} lines (max {{max}}). Split it into smaller components.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename.endsWith(".svelte")) return {};
    const max = (context.options[0] as { max?: number } | undefined)?.max ??
      DEFAULT_MAX_LINES;
    return {
      Program(node) {
        const lines = context.sourceCode.lines.length;
        if (lines > max) {
          context.report({
            node,
            messageId: "tooLarge",
            data: { lines: String(lines), max: String(max) },
          });
        }
      },
    };
  },
};

import type { Rule } from "eslint";
import type { Property } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "csrf-disabled-check";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "Disabling SvelteKit's `csrf.checkOrigin` (`{ kit: { csrf: { checkOrigin: false } } }`) opens cross-site form-submission attacks.",
});

const SVELTE_CONFIG_FILENAME = /(?:^|\/)svelte\.config\.(?:js|ts|mjs|cjs)$/;

function isSvelteConfig(filename: string): boolean {
  return SVELTE_CONFIG_FILENAME.test(filename);
}

function propertyName(prop: Property): string | null {
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
    return prop.key.value;
  }
  return null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Flag `csrf.checkOrigin: false` in SvelteKit svelte.config.js.",
      recommended: true,
    },
    schema: [],
    messages: {
      csrfDisabled:
        "`csrf.checkOrigin: false` disables SvelteKit's built-in CSRF protection. Re-enable it unless you have a deliberate, audited reason to disable it.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isSvelteConfig(filename)) return {};

    return {
      Property(node: Property) {
        if (propertyName(node) !== "checkOrigin") return;
        if (
          node.value.type === "Literal" &&
          (node.value as { value: unknown }).value === false
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "csrfDisabled",
          });
        }
      },
    };
  },
};

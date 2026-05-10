import type { Rule } from "eslint";
import type { CallExpression, NewExpression, Node } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-hydration-mismatch";

registerRuleMeta({
  id: RULE_ID,
  category: "architecture",
  defaultSeverity: "warning",
  description:
    "Time/random APIs called during render produce different values on server vs client and trigger hydration mismatches in SvelteKit. Move to onMount, $effect, or an event handler.",
});

const TIME_RANDOM_GLOBALS: Record<string, string> = {
  "Date.now": "Date.now()",
  "performance.now": "performance.now()",
  "Math.random": "Math.random()",
};

const TIME_RANDOM_MEMBER_PATTERNS: Array<{
  object: string;
  property: string;
  display: string;
}> = [
  { object: "crypto", property: "randomUUID", display: "crypto.randomUUID()" },
  {
    object: "crypto",
    property: "getRandomValues",
    display: "crypto.getRandomValues()",
  },
];

function callMatchesGlobal(node: CallExpression): string | null {
  const callee = node.callee;
  if (callee.type === "Identifier" && callee.name === "fetch") return null;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  if (callee.object.type !== "Identifier") return null;
  if (callee.property.type !== "Identifier") return null;
  const key = `${callee.object.name}.${callee.property.name}`;
  if (TIME_RANDOM_GLOBALS[key]) return TIME_RANDOM_GLOBALS[key];
  for (const pattern of TIME_RANDOM_MEMBER_PATTERNS) {
    if (
      callee.object.name === pattern.object &&
      callee.property.name === pattern.property
    ) {
      return pattern.display;
    }
  }
  return null;
}

function isNewDate(node: NewExpression): boolean {
  return (
    node.callee.type === "Identifier" &&
    node.callee.name === "Date" &&
    node.arguments.length === 0
  );
}

/**
 * Returns true when this node is inside a place that runs at hydration time
 * (top-level module body, $derived expression, or {expr} in template). Returns
 * false when wrapped in an event handler, onMount, $effect, or a regular
 * function declaration that may or may not be called during render.
 */
function isInHydrationContext(
  ancestors: readonly Node[],
): boolean {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i] as Node & { type: string };
    if (a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression") {
      const parent = ancestors[i - 1] as (Node & { type: string }) | undefined;
      if (!parent) return false;
      if (parent.type === "CallExpression") {
        const callee = (parent as unknown as CallExpression).callee;
        if (callee.type === "Identifier") {
          if (callee.name === "$derived" || callee.name === "$derived.by") {
            return true;
          }
          // $effect, onMount, beforeUpdate, afterUpdate, tick, etc. — not at hydration time
          return false;
        }
        if (callee.type === "MemberExpression" && !callee.computed) {
          if (
            callee.object.type === "Identifier" &&
            callee.object.name === "$derived"
          ) {
            return true;
          }
        }
      }
      return false;
    }
    if (a.type === "FunctionDeclaration") return false;
    if ((a.type as string) === "SvelteMustacheTag") return true;
  }
  return true;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn when Date/random APIs run during render — they cause SSR hydration mismatches.",
      recommended: true,
    },
    schema: [],
    messages: {
      hydrationMismatch:
        "{{api}} during render produces different values on server vs client. Move to onMount, $effect, or an event handler — or seed it on the server and pass via props.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function check(rawNode: Node, api: string) {
      const ancestors = sourceCode.getAncestors(rawNode as Rule.Node) as Node[];
      if (!isInHydrationContext(ancestors)) return;
      context.report({
        node: rawNode as Rule.Node,
        messageId: "hydrationMismatch",
        data: { api },
      });
    }

    return {
      CallExpression(node) {
        const display = callMatchesGlobal(node as CallExpression);
        if (display) check(node as unknown as Node, display);
      },
      NewExpression(node) {
        if (isNewDate(node as NewExpression)) {
          check(node as unknown as Node, "new Date()");
        }
      },
    };
  },
};

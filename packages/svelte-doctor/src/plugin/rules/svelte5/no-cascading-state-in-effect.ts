import type { Rule } from "eslint";
import type {
  AssignmentExpression,
  CallExpression,
  ExpressionStatement,
  Statement,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-cascading-state-in-effect";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "Multiple state assignments inside a single `$effect` cascade re-runs and are usually a sign that values should be derived instead.",
});

const THRESHOLD = 2;

function isEffectCall(node: CallExpression): boolean {
  return (
    node.callee.type === "Identifier" && node.callee.name === "$effect"
  );
}

function countAssignments(stmts: readonly Statement[]): number {
  let count = 0;
  for (const stmt of stmts) {
    if (stmt.type !== "ExpressionStatement") continue;
    const expr = (stmt as ExpressionStatement).expression;
    if (
      expr.type === "AssignmentExpression" &&
      (expr as AssignmentExpression).operator === "="
    ) {
      count++;
    }
  }
  return count;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when an $effect contains multiple state assignments that may cascade.",
      recommended: true,
    },
    schema: [],
    messages: {
      cascading:
        "$effect performs {{count}} state assignments. Cascading writes re-trigger effects — consider $derived or splitting the effect.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isEffectCall(node as CallExpression)) return;
        const arg = (node as CallExpression).arguments[0];
        if (!arg) return;
        if (
          arg.type !== "ArrowFunctionExpression" &&
          arg.type !== "FunctionExpression"
        ) {
          return;
        }
        if (arg.body.type !== "BlockStatement") return;
        const count = countAssignments(arg.body.body);
        if (count < THRESHOLD) return;
        context.report({
          node,
          messageId: "cascading",
          data: { count: String(count) },
        });
      },
    };
  },
};

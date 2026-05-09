import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Statement,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "prefer-derived-over-effect";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "An `$effect` whose only job is to assign a `$state` value computed from other state should be a `$derived`.",
});

function isEffectCall(node: CallExpression): boolean {
  return (
    node.callee.type === "Identifier" && node.callee.name === "$effect"
  );
}

function getEffectBody(
  arg: CallExpression["arguments"][number] | undefined,
): Statement[] | null {
  if (!arg) return null;
  if (
    arg.type !== "ArrowFunctionExpression" &&
    arg.type !== "FunctionExpression"
  ) {
    return null;
  }
  const fn = arg as ArrowFunctionExpression | FunctionExpression;
  if (fn.body.type !== "BlockStatement") return null;
  return fn.body.body;
}

function isPureAssignmentOnly(statements: Statement[]): boolean {
  if (statements.length === 0) return false;
  for (const stmt of statements) {
    if (stmt.type !== "ExpressionStatement") return false;
    const expr = stmt.expression;
    if (expr.type !== "AssignmentExpression") return false;
    if (expr.operator !== "=") return false;
    if (expr.left.type !== "Identifier" && expr.left.type !== "MemberExpression") {
      return false;
    }
    const right = expr.right;
    if (
      right.type === "CallExpression" ||
      right.type === "NewExpression" ||
      right.type === "AwaitExpression" ||
      right.type === "YieldExpression" ||
      right.type === "AssignmentExpression"
    ) {
      return false;
    }
  }
  return true;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest replacing $effect with $derived when the effect only assigns computed state.",
      recommended: true,
    },
    schema: [],
    messages: {
      preferDerived:
        "This $effect only assigns computed state. Use `$derived(...)` for the target value instead.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isEffectCall(node as CallExpression)) return;
        const body = getEffectBody(
          (node as CallExpression).arguments[0],
        );
        if (!body) return;
        if (!isPureAssignmentOnly(body)) return;
        context.report({ node, messageId: "preferDerived" });
      },
    };
  },
};

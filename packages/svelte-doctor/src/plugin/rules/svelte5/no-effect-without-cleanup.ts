import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Node,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-effect-without-cleanup";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "An `$effect` that registers a listener, timer, or subscription must return a cleanup function or it will leak.",
});

const NEEDS_CLEANUP_GLOBALS = new Set([
  "addEventListener",
  "setInterval",
  "setTimeout",
]);

function isEffectCall(node: CallExpression): boolean {
  return (
    node.callee.type === "Identifier" && node.callee.name === "$effect"
  );
}

function getCallee(node: CallExpression): { name: string | null } {
  if (node.callee.type === "Identifier") return { name: node.callee.name };
  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier"
  ) {
    return { name: node.callee.property.name };
  }
  return { name: null };
}

function fnBodyStatements(
  fn: ArrowFunctionExpression | FunctionExpression,
): readonly Node[] {
  if (fn.body.type === "BlockStatement") return fn.body.body;
  return [fn.body];
}

function hasReturnStatement(
  fn: ArrowFunctionExpression | FunctionExpression,
): boolean {
  if (fn.body.type !== "BlockStatement") return true;
  return fn.body.body.some(
    (stmt) =>
      stmt.type === "ReturnStatement" &&
      stmt.argument != null &&
      stmt.argument.type !== "Literal",
  );
}

function bodyRegistersListener(
  fn: ArrowFunctionExpression | FunctionExpression,
): boolean {
  const stack: Node[] = [...fnBodyStatements(fn)] as Node[];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || !("type" in current)) continue;
    if (current.type === "CallExpression") {
      const callee = getCallee(current);
      if (callee.name && NEEDS_CLEANUP_GLOBALS.has(callee.name)) return true;
    }
    if (current.type === "FunctionExpression" || current.type === "ArrowFunctionExpression") {
      continue;
    }
    for (const key of Object.keys(current)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            stack.push(item as Node);
          }
        }
      } else if (child && typeof child === "object" && "type" in child) {
        stack.push(child as Node);
      }
    }
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn when $effect registers listeners/timers without returning a cleanup function.",
      recommended: true,
    },
    schema: [],
    messages: {
      missingCleanup:
        "$effect registers a listener or timer but does not return a cleanup function — it will leak across re-runs.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isEffectCall(node as CallExpression)) return;
        const arg = (node as CallExpression).arguments[0];
        if (
          !arg ||
          (arg.type !== "ArrowFunctionExpression" &&
            arg.type !== "FunctionExpression")
        ) {
          return;
        }
        const fn = arg as ArrowFunctionExpression | FunctionExpression;
        if (!bodyRegistersListener(fn)) return;
        if (hasReturnStatement(fn)) return;
        context.report({ node, messageId: "missingCleanup" });
      },
    };
  },
};

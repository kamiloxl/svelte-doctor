import type { Rule } from "eslint";
import type { CallExpression, NewExpression } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-eval";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "Disallow `eval`, `new Function(...)`, and string-form `setTimeout` / `setInterval` — they enable arbitrary code execution.",
});

const STRING_TIMER_CALLEES = new Set(["setTimeout", "setInterval"]);

function isStringLikeArg(arg: { type: string }): boolean {
  return (
    arg.type === "Literal" ||
    arg.type === "TemplateLiteral" ||
    arg.type === "BinaryExpression" ||
    arg.type === "Identifier"
  );
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow eval, new Function(string), and string-form setTimeout/setInterval.",
      recommended: true,
    },
    schema: [],
    messages: {
      noEval: "`eval` is unsafe and bypasses CSP. Avoid it.",
      noFunction:
        "`new Function(...)` evaluates a string and is equivalent to eval. Avoid it.",
      noStringTimer:
        "`{{name}}` with a string argument runs eval. Pass a function instead.",
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "eval"
        ) {
          context.report({ node, messageId: "noEval" });
          return;
        }
        if (
          node.callee.type === "Identifier" &&
          STRING_TIMER_CALLEES.has(node.callee.name) &&
          node.arguments.length > 0 &&
          node.arguments[0].type === "Literal" &&
          typeof (node.arguments[0] as { value: unknown }).value === "string"
        ) {
          context.report({
            node,
            messageId: "noStringTimer",
            data: { name: node.callee.name },
          });
          return;
        }
        if (
          node.callee.type === "Identifier" &&
          STRING_TIMER_CALLEES.has(node.callee.name) &&
          node.arguments.length > 0 &&
          node.arguments[0].type === "TemplateLiteral"
        ) {
          context.report({
            node,
            messageId: "noStringTimer",
            data: { name: node.callee.name },
          });
        }
      },
      NewExpression(node: NewExpression) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Function" &&
          node.arguments.length > 0 &&
          isStringLikeArg(node.arguments[0])
        ) {
          context.report({ node, messageId: "noFunction" });
        }
      },
    };
  },
};

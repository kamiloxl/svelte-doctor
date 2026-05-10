import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  AssignmentExpression,
  CallExpression,
  FunctionExpression,
  Identifier,
  Node,
  UpdateExpression,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-effect-chain";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "An `$effect` reacts to a value that another `$effect` writes — chains add a render per link and become brittle. Compute what you can with `$derived`, or write related state in the original event handler.",
});

type Fn = ArrowFunctionExpression | FunctionExpression;

function isEffectCall(node: CallExpression): boolean {
  if (node.callee.type === "Identifier") {
    return (
      node.callee.name === "$effect" || node.callee.name === "$effect.pre"
    );
  }
  if (node.callee.type === "MemberExpression" && !node.callee.computed) {
    return (
      node.callee.object.type === "Identifier" &&
      node.callee.object.name === "$effect" &&
      node.callee.property.type === "Identifier" &&
      (node.callee.property.name === "pre" ||
        node.callee.property.name === "root")
    );
  }
  return false;
}

function rootIdentifier(
  node: AssignmentExpression["left"] | UpdateExpression["argument"],
): Identifier | null {
  if (node.type === "Identifier") return node;
  if (node.type === "MemberExpression") {
    return rootIdentifier(node.object as AssignmentExpression["left"]);
  }
  return null;
}

interface EffectInfo {
  node: CallExpression;
  writes: Set<string>;
  reads: Set<string>;
}

function analyzeEffect(fn: Fn): { writes: Set<string>; reads: Set<string> } {
  const writes = new Set<string>();
  const reads = new Set<string>();
  const stack: unknown[] = [fn.body];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    const n = current as Node & { type?: string };
    if (!n.type) continue;
    if (n.type === "AssignmentExpression") {
      const ae = n as AssignmentExpression;
      const root = rootIdentifier(ae.left);
      if (root) writes.add(root.name);
      stack.push(ae.right);
      continue;
    }
    if (n.type === "UpdateExpression") {
      const ue = n as UpdateExpression;
      const root = rootIdentifier(ue.argument);
      if (root) writes.add(root.name);
      continue;
    }
    if (n.type === "Identifier") {
      reads.add((n as Identifier).name);
      continue;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) if (item && typeof item === "object") stack.push(item);
      } else if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }
  return { writes, reads };
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Detect $effect that reads a value written by another $effect (chain).",
      recommended: true,
    },
    schema: [],
    messages: {
      effectChain:
        "This `$effect` reads `{{name}}` which is written by another `$effect`. Effect chains add an extra render per link — derive `{{name}}` with `$derived(...)`, or set both values in the original event handler.",
    },
  },
  create(context) {
    const effects: EffectInfo[] = [];

    return {
      CallExpression(node) {
        const ce = node as CallExpression;
        if (!isEffectCall(ce)) return;
        const arg = ce.arguments[0];
        if (
          !arg ||
          (arg.type !== "ArrowFunctionExpression" &&
            arg.type !== "FunctionExpression")
        ) {
          return;
        }
        const { writes, reads } = analyzeEffect(arg as Fn);
        effects.push({ node: ce, writes, reads });
      },
      "Program:exit"() {
        if (effects.length < 2) return;
        for (let i = 0; i < effects.length; i++) {
          const reader = effects[i];
          for (let j = 0; j < effects.length; j++) {
            if (i === j) continue;
            const writer = effects[j];
            for (const name of writer.writes) {
              if (!reader.reads.has(name)) continue;
              if (reader.writes.has(name)) continue; // mutual / self-feedback handled elsewhere
              context.report({
                node: reader.node as Rule.Node,
                messageId: "effectChain",
                data: { name },
              });
              return;
            }
          }
        }
      },
    };
  },
};

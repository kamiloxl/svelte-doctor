import type { Rule } from "eslint";
import type {
  AssignmentExpression,
  CallExpression,
  Identifier,
  Node,
  Pattern,
  UpdateExpression,
  VariableDeclarator,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "prefer-let-over-state";

registerRuleMeta({
  id: RULE_ID,
  category: "performance",
  defaultSeverity: "warning",
  description:
    "A `$state(...)` value that is never read reactively — only mutated — adds unnecessary tracking overhead. Use a plain `let` instead.",
});

const MUTATING_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  "set",
  "delete",
  "clear",
  "add",
]);

function isStateCall(node: CallExpression): boolean {
  if (node.callee.type === "Identifier") {
    return (
      node.callee.name === "$state" || node.callee.name === "$state.raw"
    );
  }
  if (node.callee.type === "MemberExpression" && !node.callee.computed) {
    return (
      node.callee.object.type === "Identifier" &&
      node.callee.object.name === "$state" &&
      node.callee.property.type === "Identifier" &&
      node.callee.property.name === "raw"
    );
  }
  return false;
}

function collectPatternNames(pattern: Pattern, out: Set<string>): void {
  if (pattern.type === "Identifier") {
    out.add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const p of pattern.properties) {
      if (p.type === "Property") collectPatternNames(p.value as Pattern, out);
      else collectPatternNames(p.argument as Pattern, out);
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const e of pattern.elements) if (e) collectPatternNames(e as Pattern, out);
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    collectPatternNames(pattern.left as Pattern, out);
  }
}

function rootIdentifier(
  node: AssignmentExpression["left"] | UpdateExpression["argument"],
): Identifier | null {
  if (node.type === "Identifier") return node;
  if (node.type === "MemberExpression") {
    return rootIdentifier(
      node.object as AssignmentExpression["left"],
    );
  }
  return null;
}

interface StateBinding {
  name: string;
  declarator: VariableDeclarator;
  reads: number;
  writes: number;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Flag $state declarations that are only mutated and never read reactively.",
      recommended: true,
    },
    schema: [],
    messages: {
      preferLet:
        "`{{name}}` is declared with `$state` but never read reactively. Use a plain `let {{name}} = …` to avoid reactive tracking overhead.",
    },
  },
  create(context) {
    const bindings = new Map<string, StateBinding>();

    function lhsRoot(
      node: AssignmentExpression | UpdateExpression,
    ): string | null {
      if (node.type === "AssignmentExpression") {
        return rootIdentifier(node.left)?.name ?? null;
      }
      return rootIdentifier(node.argument)?.name ?? null;
    }

    return {
      VariableDeclarator(node: VariableDeclarator) {
        if (
          node.init?.type === "CallExpression" &&
          isStateCall(node.init as CallExpression) &&
          node.id.type === "Identifier"
        ) {
          const names = new Set<string>();
          collectPatternNames(node.id as Pattern, names);
          for (const name of names) {
            bindings.set(name, { name, declarator: node, reads: 0, writes: 0 });
          }
        }
      },
      "AssignmentExpression, UpdateExpression"(
        node: AssignmentExpression | UpdateExpression,
      ) {
        const name = lhsRoot(node);
        if (name && bindings.has(name)) {
          bindings.get(name)!.writes++;
        }
      },
      Identifier(node: Identifier) {
        if (!bindings.has(node.name)) return;
        const parentNode = (node as unknown as { parent?: Rule.Node }).parent;
        const parent = parentNode as
          | (AssignmentExpression & { type: "AssignmentExpression" })
          | (UpdateExpression & { type: "UpdateExpression" })
          | (VariableDeclarator & { type: "VariableDeclarator" })
          | { type: string; object?: Node; property?: Node }
          | undefined;
        if (!parent) {
          bindings.get(node.name)!.reads++;
          return;
        }
        if (parent.type === "AssignmentExpression") {
          const ae = parent as AssignmentExpression;
          if (ae.left === (node as unknown as Node)) {
            return; // LHS of any assignment — write only.
          }
        }
        if (parent.type === "UpdateExpression") {
          return; // x++ or ++x — write
        }
        if (parent.type === "VariableDeclarator") {
          const vd = parent as VariableDeclarator;
          if (vd.id === (node as unknown as Node)) return; // declaration site
        }
        if (
          parent.type === "MemberExpression" &&
          (parent as { object?: Node }).object === (node as unknown as Node)
        ) {
          // foo.method(...) — check if it's a mutating call (push, pop, etc.)
          const grand = (parent as unknown as { parent?: Rule.Node }).parent;
          if (
            grand &&
            (grand as { type: string }).type === "CallExpression" &&
            (grand as unknown as CallExpression).callee ===
              (parent as unknown as Node) &&
            (parent as unknown as { property?: { type: string; name?: string } })
              .property?.type === "Identifier" &&
            MUTATING_METHODS.has(
              (parent as unknown as { property: { name: string } }).property.name,
            )
          ) {
            bindings.get(node.name)!.writes++;
            return;
          }
        }
        bindings.get(node.name)!.reads++;
      },
      "Program:exit"() {
        for (const binding of bindings.values()) {
          if (binding.reads === 0 && binding.writes > 0) {
            context.report({
              node: binding.declarator as Rule.Node,
              messageId: "preferLet",
              data: { name: binding.name },
            });
          }
        }
      },
    };
  },
};

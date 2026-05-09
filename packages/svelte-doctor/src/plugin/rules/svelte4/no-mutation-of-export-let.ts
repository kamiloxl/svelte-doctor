import type { Rule } from "eslint";
import type {
  AssignmentExpression,
  ExportNamedDeclaration,
  Identifier,
  Pattern,
  UpdateExpression,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-mutation-of-export-let";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "error",
  description:
    "Mutating a Svelte 4 prop declared via `export let` breaks one-way data flow. Lift state up or expose a callback prop.",
});

function collectPatternNames(pattern: Pattern, out: Set<string>): void {
  if (pattern.type === "Identifier") {
    out.add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "Property") {
        collectPatternNames(prop.value as Pattern, out);
      } else if (prop.type === "RestElement") {
        collectPatternNames(prop.argument as Pattern, out);
      }
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) {
      if (element) collectPatternNames(element as Pattern, out);
    }
    return;
  }
  if (pattern.type === "RestElement") {
    collectPatternNames(pattern.argument as Pattern, out);
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
    return rootIdentifier(node.object as AssignmentExpression["left"]);
  }
  return null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow assigning to identifiers declared via `export let`.",
      recommended: true,
    },
    schema: [],
    messages: {
      mutation:
        "`{{name}}` is a Svelte 4 prop (declared with `export let`) and should not be mutated. Lift state up or expose a callback prop.",
    },
  },
  create(context) {
    const propsNames = new Set<string>();

    return {
      ExportNamedDeclaration(node: ExportNamedDeclaration) {
        const decl = node.declaration;
        if (
          !decl ||
          decl.type !== "VariableDeclaration" ||
          decl.kind !== "let"
        ) {
          return;
        }
        for (const declarator of decl.declarations) {
          collectPatternNames(declarator.id as Pattern, propsNames);
        }
      },
      AssignmentExpression(node: AssignmentExpression) {
        const root = rootIdentifier(node.left);
        if (!root || !propsNames.has(root.name)) return;
        context.report({
          node,
          messageId: "mutation",
          data: { name: root.name },
        });
      },
      UpdateExpression(node: UpdateExpression) {
        const root = rootIdentifier(node.argument);
        if (!root || !propsNames.has(root.name)) return;
        context.report({
          node,
          messageId: "mutation",
          data: { name: root.name },
        });
      },
    };
  },
};

export const ruleId = RULE_ID;

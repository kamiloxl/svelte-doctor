import type { Rule } from "eslint";
import type {
  ExportNamedDeclaration,
  Identifier,
  Node,
  Pattern,
  Program,
  VariableDeclaration,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "prefer-reactive-statement";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "Prefer `$: foo = expr` for values derived from props/state in Svelte 4. A bare `let foo = expr` does not re-run when its inputs change.",
});

function collectIdentifiersInPattern(
  pattern: Pattern,
  out: Set<string>,
): void {
  if (pattern.type === "Identifier") {
    out.add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "Property") {
        collectIdentifiersInPattern(prop.value as Pattern, out);
      } else if (prop.type === "RestElement") {
        collectIdentifiersInPattern(prop.argument as Pattern, out);
      }
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const el of pattern.elements) {
      if (el) collectIdentifiersInPattern(el as Pattern, out);
    }
    return;
  }
  if (pattern.type === "RestElement") {
    collectIdentifiersInPattern(pattern.argument as Pattern, out);
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    collectIdentifiersInPattern(pattern.left as Pattern, out);
  }
}

function exprReferencesAny(expr: Node, names: Set<string>): boolean {
  const stack: Node[] = [expr];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || !("type" in current)) {
      continue;
    }
    if (current.type === "Identifier" && names.has((current as Identifier).name)) {
      return true;
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
    type: "suggestion",
    docs: {
      description:
        "Prefer `$: foo = expr` over `let foo = expr` when expr references a prop in Svelte 4.",
      recommended: true,
    },
    schema: [],
    messages: {
      preferReactive:
        "`{{name}}` is derived from a prop but declared with plain `let` — use `$: {{name}} = ...` so it updates when the prop changes.",
    },
  },
  create(context) {
    return {
      Program(program: Program) {
        const propsNames = new Set<string>();
        for (const stmt of program.body) {
          if (stmt.type !== "ExportNamedDeclaration") continue;
          const exp = stmt as ExportNamedDeclaration;
          const decl = exp.declaration;
          if (
            !decl ||
            decl.type !== "VariableDeclaration" ||
            decl.kind !== "let"
          ) {
            continue;
          }
          for (const declarator of decl.declarations) {
            collectIdentifiersInPattern(declarator.id as Pattern, propsNames);
          }
        }
        if (!propsNames.size) return;

        for (const stmt of program.body) {
          if (stmt.type !== "VariableDeclaration") continue;
          const varDecl = stmt as VariableDeclaration;
          if (varDecl.kind !== "let") continue;
          for (const declarator of varDecl.declarations) {
            if (!declarator.init) continue;
            if (declarator.id.type !== "Identifier") continue;
            const name = declarator.id.name;
            if (propsNames.has(name)) continue;
            if (!exprReferencesAny(declarator.init as Node, propsNames)) {
              continue;
            }
            context.report({
              node: declarator,
              messageId: "preferReactive",
              data: { name },
            });
          }
        }
      },
    };
  },
};

export const ruleId = RULE_ID;

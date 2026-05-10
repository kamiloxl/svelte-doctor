import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  AwaitExpression,
  ExpressionStatement,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  Node,
  Statement,
  VariableDeclaration,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-sequential-await-in-load";

registerRuleMeta({
  id: RULE_ID,
  category: "performance",
  defaultSeverity: "warning",
  description:
    "Sequential `await` in a SvelteKit load function with no data dependency between calls — wrap independent fetches in `Promise.all([...])` so they race instead of waterfalling.",
});

type LoadFn = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

function isLoadFile(filename: string): boolean {
  return /(?:^|[\\\/])\+(page|layout)\.(server\.)?(ts|js)$/.test(filename);
}

function collectIdentifierNames(node: Node | null | undefined, out: Set<string>): void {
  if (!node || typeof node !== "object" || !("type" in node)) return;
  if (node.type === "Identifier") {
    out.add((node as Identifier).name);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range" || key === "parent") continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) collectIdentifierNames(item as Node, out);
    } else if (child && typeof child === "object" && "type" in (child as Node)) {
      collectIdentifierNames(child as Node, out);
    }
  }
}

interface AwaitSite {
  statement: Statement;
  declaredNames: string[]; // names introduced by `const a = await …`
  awaitExpression: AwaitExpression;
}

function extractAwaitSite(stmt: Statement): AwaitSite | null {
  if (stmt.type === "VariableDeclaration") {
    const decl = stmt as VariableDeclaration;
    if (decl.declarations.length !== 1) return null;
    const d = decl.declarations[0];
    if (!d.init || d.init.type !== "AwaitExpression") return null;
    const declaredNames: string[] = [];
    collectIdentifierNames(d.id as Node, new Set()); // discard
    const set = new Set<string>();
    collectIdentifierNames(d.id as Node, set);
    declaredNames.push(...set);
    return {
      statement: stmt,
      declaredNames,
      awaitExpression: d.init as AwaitExpression,
    };
  }
  if (stmt.type === "ExpressionStatement") {
    const expr = (stmt as ExpressionStatement).expression;
    if (expr.type === "AwaitExpression") {
      return {
        statement: stmt,
        declaredNames: [],
        awaitExpression: expr as AwaitExpression,
      };
    }
  }
  return null;
}

function awaitArgumentReadsAnyOf(
  awaitExpr: AwaitExpression,
  names: readonly string[],
): boolean {
  if (!names.length) return false;
  const reads = new Set<string>();
  collectIdentifierNames(awaitExpr.argument as Node, reads);
  return names.some((n) => reads.has(n));
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Detect sequential awaits in SvelteKit load functions that don't depend on each other — should be Promise.all.",
      recommended: true,
    },
    schema: [],
    messages: {
      sequential:
        "Sequential await with no dependency on the previous result — wrap them in `Promise.all([...])` so they race instead of waterfalling.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isLoadFile(filename)) return {};

    function checkBlock(statements: readonly Statement[]) {
      const sites = statements
        .map(extractAwaitSite)
        .filter((s): s is AwaitSite => s !== null);
      if (sites.length < 2) return;

      const namesIntroducedSoFar: string[] = [];
      for (let i = 0; i < sites.length; i++) {
        const current = sites[i];
        if (i > 0) {
          if (!awaitArgumentReadsAnyOf(current.awaitExpression, namesIntroducedSoFar)) {
            context.report({
              node: current.statement as Rule.Node,
              messageId: "sequential",
            });
          }
        }
        namesIntroducedSoFar.push(...current.declaredNames);
      }
    }

    function visitFnBody(fn: LoadFn) {
      if (fn.body.type !== "BlockStatement") return;
      checkBlock(fn.body.body);
    }

    function isLoadIdentifier(name: string | undefined): boolean {
      return name === "load";
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;
        if (
          decl.type === "FunctionDeclaration" &&
          isLoadIdentifier(decl.id?.name)
        ) {
          visitFnBody(decl);
          return;
        }
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (
              d.id.type === "Identifier" &&
              isLoadIdentifier(d.id.name) &&
              d.init &&
              (d.init.type === "FunctionExpression" ||
                d.init.type === "ArrowFunctionExpression")
            ) {
              visitFnBody(d.init as LoadFn);
            }
          }
        }
      },
    };
  },
};

import type { Rule } from "eslint";
import type { CallExpression, ImportDeclaration, Property } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-private-env-leak";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "Re-exporting / returning `$env/static/private` or `$env/dynamic/private` values from a `+page.server.ts` `load` function leaks them to the client via the loader payload.",
});

const SERVER_LOAD_FILENAME =
  /(?:^|\/)\+(?:page|layout)\.server\.(?:ts|js)$|(?:^|\/)\+server\.(?:ts|js)$/;

function isServerLoadFile(filename: string): boolean {
  return SERVER_LOAD_FILENAME.test(filename);
}

interface PrivateEnvBindings {
  names: Set<string>;
  namespaces: Set<string>;
}

function collectPrivateEnvBindings(
  imports: ImportDeclaration[],
): PrivateEnvBindings {
  const bindings: PrivateEnvBindings = {
    names: new Set(),
    namespaces: new Set(),
  };
  for (const imp of imports) {
    const source = String(imp.source.value);
    if (
      source !== "$env/static/private" &&
      source !== "$env/dynamic/private"
    ) {
      continue;
    }
    for (const spec of imp.specifiers) {
      if (spec.type === "ImportSpecifier") {
        bindings.names.add(spec.local.name);
      } else if (spec.type === "ImportNamespaceSpecifier") {
        bindings.namespaces.add(spec.local.name);
      } else if (spec.type === "ImportDefaultSpecifier") {
        bindings.names.add(spec.local.name);
      }
    }
  }
  return bindings;
}

function returnedObjectProperties(fn: unknown): Property[] {
  const out: Property[] = [];
  const fnNode = fn as { type?: string; body?: unknown };

  // Implicit-return arrow: `() => ({ ... })`
  if (
    fnNode.type === "ArrowFunctionExpression" &&
    fnNode.body &&
    typeof fnNode.body === "object" &&
    (fnNode.body as { type?: string }).type === "ObjectExpression"
  ) {
    const props = (fnNode.body as { properties?: Property[] }).properties;
    if (props) {
      for (const p of props) {
        if (p.type === "Property") out.push(p);
      }
    }
  }

  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const cur = n as { type?: string };
    if (cur.type === "ReturnStatement") {
      const arg = (cur as { argument?: unknown }).argument as
        | { type?: string; properties?: Property[] }
        | undefined;
      if (arg && arg.type === "ObjectExpression" && arg.properties) {
        for (const p of arg.properties) {
          if (p.type === "Property") out.push(p);
        }
      }
    }
    for (const key of Object.keys(cur as object)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (cur as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(fn);
  return out;
}

function identifierLeaksPrivate(
  expression: { type: string; name?: string; object?: { type: string; name?: string } },
  bindings: PrivateEnvBindings,
): boolean {
  if (expression.type === "Identifier" && expression.name) {
    if (bindings.names.has(expression.name)) return true;
  }
  if (
    expression.type === "MemberExpression" &&
    expression.object?.type === "Identifier" &&
    expression.object.name &&
    bindings.namespaces.has(expression.object.name)
  ) {
    return true;
  }
  return false;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow returning $env/*/private values from server load functions (would leak to client).",
      recommended: true,
    },
    schema: [],
    messages: {
      privateEnvLeak:
        "Property `{{name}}` returns a `$env/*/private` value from a server load — it will be serialised to the client. Compute the result server-side and only return derived/safe data.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isServerLoadFile(filename)) return {};

    const imports: ImportDeclaration[] = [];

    return {
      ImportDeclaration(node: ImportDeclaration) {
        imports.push(node);
      },
      "Program:exit"(programNode) {
        const bindings = collectPrivateEnvBindings(imports);
        if (!bindings.names.size && !bindings.namespaces.size) return;
        const program = programNode as { body: unknown[] };
        const visit = (n: unknown) => {
          if (!n || typeof n !== "object") return;
          const cur = n as { type?: string };
          if (
            cur.type === "FunctionDeclaration" ||
            cur.type === "FunctionExpression" ||
            cur.type === "ArrowFunctionExpression"
          ) {
            for (const prop of returnedObjectProperties(cur)) {
              if (prop.key.type !== "Identifier") continue;
              const value = prop.value as {
                type: string;
                name?: string;
                object?: { type: string; name?: string };
              };
              if (identifierLeaksPrivate(value, bindings)) {
                context.report({
                  node: prop as unknown as Rule.Node,
                  messageId: "privateEnvLeak",
                  data: { name: prop.key.name },
                });
              }
            }
          }
          for (const key of Object.keys(cur as object)) {
            if (key === "loc" || key === "range" || key === "parent") continue;
            const child = (cur as unknown as Record<string, unknown>)[key];
            if (Array.isArray(child)) child.forEach(visit);
            else if (child && typeof child === "object") visit(child);
          }
        };
        for (const stmt of program.body) visit(stmt);
      },
    };
  },
};

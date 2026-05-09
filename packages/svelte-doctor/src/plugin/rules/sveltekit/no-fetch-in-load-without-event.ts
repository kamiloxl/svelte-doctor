import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  Pattern,
  VariableDeclarator,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-fetch-in-load-without-event";

registerRuleMeta({
  id: RULE_ID,
  category: "performance",
  defaultSeverity: "error",
  description:
    "Use `event.fetch` (the destructured `fetch` from the load event) instead of bare `fetch()` so SvelteKit can dedupe and SSR-replay requests.",
});

type LoadFn = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

const LOAD_NAMES = new Set(["load"]);

function loadAcceptsEventFetch(fn: LoadFn): boolean {
  const param = fn.params[0];
  if (!param) return false;
  if (param.type === "ObjectPattern") {
    return param.properties.some(
      (prop) =>
        prop.type === "Property" &&
        prop.key.type === "Identifier" &&
        prop.key.name === "fetch",
    );
  }
  return param.type === "Identifier";
}

function patternIsLoadName(pattern: Pattern): boolean {
  return pattern.type === "Identifier" && LOAD_NAMES.has(pattern.name);
}

function bareFetchCalls(fn: LoadFn): CallExpression[] {
  const result: CallExpression[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string };
    if (
      node.type === "CallExpression" &&
      (node as unknown as CallExpression).callee.type === "Identifier" &&
      ((node as unknown as CallExpression).callee as { name: string }).name === "fetch"
    ) {
      result.push(node as unknown as CallExpression);
    }
    if (
      node.type === "FunctionExpression" ||
      node.type === "FunctionDeclaration" ||
      node.type === "ArrowFunctionExpression"
    ) {
      if (node !== fn) return;
    }
    for (const key of Object.keys(node as object)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(fn);
  return result;
}

function isLoadFile(filename: string): boolean {
  return /(?:^|\/)\+(page|layout)\.(server\.)?(ts|js)$/.test(filename);
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow bare fetch() inside a SvelteKit load function — use the event's fetch instead.",
      recommended: true,
    },
    schema: [],
    messages: {
      bareFetchInLoad:
        "Use `event.fetch` (or destructured `{ fetch }` from the load event) instead of the bare global fetch in load functions.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isLoadFile(filename)) return {};

    function checkLoadFn(fn: LoadFn) {
      if (loadAcceptsEventFetch(fn)) return;
      for (const call of bareFetchCalls(fn)) {
        context.report({ node: call, messageId: "bareFetchInLoad" });
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;
        if (decl.type === "FunctionDeclaration" && decl.id?.name && LOAD_NAMES.has(decl.id.name)) {
          checkLoadFn(decl);
        } else if (decl.type === "VariableDeclaration") {
          for (const declarator of decl.declarations) {
            const v = declarator as VariableDeclarator;
            if (
              patternIsLoadName(v.id as Pattern) &&
              v.init &&
              (v.init.type === "FunctionExpression" ||
                v.init.type === "ArrowFunctionExpression")
            ) {
              checkLoadFn(v.init as LoadFn);
            }
          }
        }
      },
    };
  },
};

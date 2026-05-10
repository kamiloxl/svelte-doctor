import type { Rule } from "eslint";
import type {
  ExportNamedDeclaration,
  Identifier,
  MemberExpression,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "prerender-with-user-data";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "A route that exports `prerender = true` must not read request-bound data (`cookies`, `request`, `locals.user`, `getRequestEvent`) — prerendered output is shared between users.",
});

const ROUTE_FILE =
  /(?:^|\/)\+(?:page|layout)(?:\.server)?\.(?:ts|js)$/;

function isRouteFile(filename: string): boolean {
  return ROUTE_FILE.test(filename);
}

const FORBIDDEN_DESTRUCTURE = new Set([
  "cookies",
  "request",
  "url",
  "getClientAddress",
  "platform",
]);

function bodyHasPrerenderTrue(body: ExportNamedDeclaration[]): boolean {
  for (const stmt of body) {
    if (!stmt.declaration) continue;
    if (stmt.declaration.type !== "VariableDeclaration") continue;
    for (const d of stmt.declaration.declarations) {
      if (
        d.id.type === "Identifier" &&
        d.id.name === "prerender" &&
        d.init &&
        d.init.type === "Literal" &&
        (d.init as { value: unknown }).value === true
      ) {
        return true;
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
        "Prerendered routes cannot read request-bound data (cookies, locals.user, etc.).",
      recommended: true,
    },
    schema: [],
    messages: {
      forbiddenAccess:
        "Route exports `prerender = true` but reads `{{name}}`. Prerendered HTML is shared across users — request-bound data must not be used.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isRouteFile(filename)) return {};

    const program = context.sourceCode.ast as unknown as {
      body: ExportNamedDeclaration[];
    };
    const exportedDecls = program.body.filter(
      (s) => (s as unknown as { type: string }).type === "ExportNamedDeclaration",
    );
    if (!bodyHasPrerenderTrue(exportedDecls)) return {};

    function checkIdentifierUsage(node: Identifier): void {
      if (!FORBIDDEN_DESTRUCTURE.has(node.name)) return;
      const parent = (node as unknown as { parent?: { type: string } }).parent;
      if (parent?.type === "Property") return;
      context.report({
        node: node as unknown as Rule.Node,
        messageId: "forbiddenAccess",
        data: { name: node.name },
      });
    }

    return {
      MemberExpression(node: MemberExpression) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "locals" &&
          node.property.type === "Identifier" &&
          (node.property.name === "user" || node.property.name === "session")
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "forbiddenAccess",
            data: { name: `locals.${node.property.name}` },
          });
        }
        if (
          node.property.type === "Identifier" &&
          node.property.name === "formData" &&
          node.object.type === "Identifier" &&
          node.object.name === "request"
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "forbiddenAccess",
            data: { name: "request.formData" },
          });
        }
      },
      "ObjectPattern Property"(rawNode: unknown) {
        const node = rawNode as { key: { type: string; name?: string } };
        if (
          node.key?.type === "Identifier" &&
          node.key.name &&
          FORBIDDEN_DESTRUCTURE.has(node.key.name)
        ) {
          context.report({
            node: rawNode as Rule.Node,
            messageId: "forbiddenAccess",
            data: { name: node.key.name },
          });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "getRequestEvent"
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "forbiddenAccess",
            data: { name: "getRequestEvent()" },
          });
        }
      },
    };
  },
};

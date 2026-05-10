import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  Property,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "form-action-without-validation";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "warning",
  description:
    "Form actions in `+page.server.ts` should validate `formData()` (e.g. zod / valibot / superforms) before trusting input.",
});

type Fn = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

const SERVER_ACTION_FILENAME =
  /(?:^|\/)\+page\.server\.(?:ts|js)$/;

function isServerActionFile(filename: string): boolean {
  return SERVER_ACTION_FILENAME.test(filename);
}

const VALIDATOR_CALL_NAME =
  /^(parse|safeParse|parseAsync|safeParseAsync|validate|assert|object)$/;
const VALIDATOR_LIB_NAME = /(zod|valibot|yup|joi|superforms|arktype|effect-schema)/i;

function functionUsesFormData(fn: Fn): boolean {
  let usesFormData = false;
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string };
    if (
      node.type === "CallExpression" &&
      (node as unknown as CallExpression).callee.type === "MemberExpression" &&
      ((node as unknown as CallExpression).callee as { property: { type: string; name?: string } }).property
        .type === "Identifier" &&
      ((node as unknown as CallExpression).callee as { property: { name?: string } }).property.name === "formData"
    ) {
      usesFormData = true;
    }
    for (const key of Object.keys(node as object)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(fn);
  return usesFormData;
}

function functionHasValidator(fn: Fn, source: string): boolean {
  if (VALIDATOR_LIB_NAME.test(source)) return true;
  let found = false;
  const visit = (n: unknown) => {
    if (found) return;
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string };
    if (
      node.type === "CallExpression" &&
      (node as unknown as CallExpression).callee.type === "MemberExpression"
    ) {
      const prop = ((node as unknown as CallExpression).callee as { property: { type: string; name?: string } })
        .property;
      if (prop.type === "Identifier" && prop.name && VALIDATOR_CALL_NAME.test(prop.name)) {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(node as object)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(fn);
  return found;
}

function actionHandlerFromProperty(prop: Property): Fn | null {
  if (prop.value.type === "FunctionExpression") return prop.value as Fn;
  if (prop.value.type === "ArrowFunctionExpression") return prop.value as Fn;
  return null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when form actions read formData() without using a validator.",
      recommended: true,
    },
    schema: [],
    messages: {
      missingValidation:
        "Action `{{name}}` reads request.formData() without an apparent validator. Validate input with zod/valibot/superforms before using it.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isServerActionFile(filename)) return {};
    const sourceText = context.sourceCode?.getText() ?? "";

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl || decl.type !== "VariableDeclaration") return;
        for (const declarator of decl.declarations) {
          if (
            declarator.id.type !== "Identifier" ||
            declarator.id.name !== "actions"
          ) {
            continue;
          }
          const init = declarator.init;
          if (!init) continue;
          let actionsObject: { properties: Property[] } | null = null;
          if (init.type === "ObjectExpression") {
            actionsObject = init as { properties: Property[] };
          } else if (
            (init as unknown as { type: string }).type === "TSAsExpression"
          ) {
            const inner = (init as unknown as {
              expression?: { type?: string; properties?: Property[] };
            }).expression;
            if (inner && inner.type === "ObjectExpression" && inner.properties) {
              actionsObject = { properties: inner.properties };
            }
          }
          if (!actionsObject) continue;

          for (const prop of actionsObject.properties) {
            if (prop.type !== "Property") continue;
            const fn = actionHandlerFromProperty(prop);
            if (!fn) continue;
            if (!functionUsesFormData(fn)) continue;
            if (functionHasValidator(fn, sourceText)) continue;
            const name =
              prop.key.type === "Identifier"
                ? prop.key.name
                : prop.key.type === "Literal"
                  ? String((prop.key as { value: unknown }).value)
                  : "<action>";
            context.report({
              node: prop as unknown as Rule.Node,
              messageId: "missingValidation",
              data: { name },
            });
          }
        }
      },
    };
  },
};

import type { Rule } from "eslint";
import type { ImportDeclaration } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "server-only-import-in-client";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "Importing `$lib/server/...` or `$env/static/private` / `$env/dynamic/private` from a client-reachable module leaks server-only code.",
});

const SERVER_ONLY_PREFIXES = [
  "$lib/server/",
  "$env/static/private",
  "$env/dynamic/private",
];

const SERVER_ONLY_FILENAME_PATTERN =
  /(\.server\.(?:ts|js|mts|cts))$|(?:^|\/)\+(?:page|layout)\.server\.(?:ts|js)$|(?:^|\/)\+server\.(?:ts|js)$|(?:^|\/)hooks\.server\.(?:ts|js)$/;

function isServerSideFile(filename: string): boolean {
  return SERVER_ONLY_FILENAME_PATTERN.test(filename);
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing $lib/server/* and $env/*/private from client-reachable files.",
      recommended: true,
    },
    schema: [],
    messages: {
      serverOnlyInClient:
        "`{{source}}` is server-only and must not be imported from `{{filename}}` (a client-reachable file).",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isServerSideFile(filename)) return {};

    return {
      ImportDeclaration(node: ImportDeclaration) {
        const source = String(node.source.value);
        const isServerOnly = SERVER_ONLY_PREFIXES.some(
          (prefix) => source === prefix || source.startsWith(prefix),
        );
        if (!isServerOnly) return;
        context.report({
          node,
          messageId: "serverOnlyInClient",
          data: { source, filename },
        });
      },
    };
  },
};

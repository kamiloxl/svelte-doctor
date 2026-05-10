import type { Rule } from "eslint";
import type { Property, VariableDeclarator } from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-secrets-in-client";

registerRuleMeta({
  id: RULE_ID,
  category: "security",
  defaultSeverity: "error",
  description:
    "Detects hard-coded secrets (API keys, tokens, credentials) in client-reachable code.",
});

const NAME_PATTERN = /\b(api[_-]?key|secret|token|password|credential|private[_-]?key|access[_-]?key|auth[_-]?token)\b/i;
const NAME_ALLOWLIST = /\b(label|placeholder|modal|prompt|test|example|fake|mock|dummy)\b/i;

const VALUE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bsk_(?:live|test)_[a-zA-Z0-9]{20,}\b/, description: "Stripe key" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, description: "AWS access key" },
  { pattern: /\bASIA[0-9A-Z]{16}\b/, description: "AWS temporary access key" },
  { pattern: /\bghp_[A-Za-z0-9]{30,}\b/, description: "GitHub personal access token" },
  { pattern: /\bghs_[A-Za-z0-9]{30,}\b/, description: "GitHub server-to-server token" },
  { pattern: /\bgho_[A-Za-z0-9]{30,}\b/, description: "GitHub OAuth token" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/, description: "GitHub fine-grained PAT" },
  { pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/, description: "GitLab PAT" },
  { pattern: /\bxox[bporas]-[A-Za-z0-9-]{20,}\b/, description: "Slack token" },
  { pattern: /\bsk-[A-Za-z0-9]{32,}\b/, description: "OpenAI/Anthropic-style key" },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, description: "Google API key" },
  { pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/, description: "JWT" },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, description: "PEM private key" },
];

const SERVER_FILENAME_PATTERN =
  /(\.server\.(?:ts|js|mts|cts))$|(?:^|\/)\+(?:page|layout)\.server\.(?:ts|js)$|(?:^|\/)\+server\.(?:ts|js)$|(?:^|\/)hooks\.server\.(?:ts|js)$|(?:^|\/)src\/lib\/server\//;

function isServerFile(filename: string): boolean {
  return SERVER_FILENAME_PATTERN.test(filename);
}

function findValuePattern(value: string): { description: string } | null {
  for (const entry of VALUE_PATTERNS) {
    if (entry.pattern.test(value)) return entry;
  }
  return null;
}

function isSecretName(name: string): boolean {
  if (NAME_ALLOWLIST.test(name)) return false;
  return NAME_PATTERN.test(name);
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hard-coded secrets in client-reachable Svelte/TS files.",
      recommended: true,
    },
    schema: [],
    messages: {
      secretValue:
        "Possible secret literal in client code ({{description}}). Move it to a server-only file or environment variable.",
      secretByName:
        "Variable `{{name}}` looks like a secret in client code. Move it to a server-only module (`*.server.ts` / `$env/static/private`).",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isServerFile(filename)) return {};

    function checkLiteral(value: unknown, node: Rule.Node): void {
      if (typeof value !== "string" || value.length < 16) return;
      const match = findValuePattern(value);
      if (!match) return;
      context.report({
        node,
        messageId: "secretValue",
        data: { description: match.description },
      });
    }

    return {
      Literal(node) {
        checkLiteral(node.value, node as Rule.Node);
      },
      TemplateElement(node) {
        const cooked = (node as { value?: { cooked?: string } }).value?.cooked;
        if (typeof cooked === "string") checkLiteral(cooked, node as Rule.Node);
      },
      VariableDeclarator(node: VariableDeclarator) {
        if (node.id.type !== "Identifier") return;
        if (!isSecretName(node.id.name)) return;
        if (!node.init) return;
        if (
          node.init.type === "Literal" &&
          typeof node.init.value === "string" &&
          node.init.value.length >= 12
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "secretByName",
            data: { name: node.id.name },
          });
        }
      },
      Property(node: Property) {
        if (node.key.type !== "Identifier") return;
        if (!isSecretName(node.key.name)) return;
        if (
          node.value.type === "Literal" &&
          typeof node.value.value === "string" &&
          node.value.value.length >= 12
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: "secretByName",
            data: { name: node.key.name },
          });
        }
      },
    };
  },
};

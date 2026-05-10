import type { ESLint, Linter, Rule } from "eslint";
import { RULE_PREFIX } from "./constants.js";
import "./plugin/rules/non-eslint-rule-meta.js";
import { rule as noFetchInEffect } from "./plugin/rules/svelte5/no-fetch-in-effect.js";
import { rule as preferDerivedOverEffect } from "./plugin/rules/svelte5/prefer-derived-over-effect.js";
import { rule as noMutationOfProps } from "./plugin/rules/svelte5/no-mutation-of-props.js";
import { rule as noEffectWithoutCleanup } from "./plugin/rules/svelte5/no-effect-without-cleanup.js";
import { rule as noCascadingStateInEffect } from "./plugin/rules/svelte5/no-cascading-state-in-effect.js";
import { rule as noCircularReactivity } from "./plugin/rules/svelte5/no-circular-reactivity.js";
import { rule as noEffectChain } from "./plugin/rules/svelte5/no-effect-chain.js";
import { rule as noHydrationMismatch } from "./plugin/rules/svelte5/no-hydration-mismatch.js";
import { rule as preferLetOverState } from "./plugin/rules/svelte5/prefer-let-over-state.js";
import { rule as noSequentialAwaitInLoad } from "./plugin/rules/sveltekit/no-sequential-await-in-load.js";
import { rule as noArrayIndexAsEachKey } from "./plugin/rules/performance/no-array-index-as-each-key.js";
import { rule as noUnsafeHtmlBinding } from "./plugin/rules/security/no-unsafe-html-binding.js";
import { rule as noHrefJavascript } from "./plugin/rules/security/no-href-javascript.js";
import { rule as noEval } from "./plugin/rules/security/no-eval.js";
import { rule as noSecretsInClient } from "./plugin/rules/security/no-secrets-in-client.js";
import { rule as noUnsafeTargetBlank } from "./plugin/rules/security/no-unsafe-target-blank.js";
import { rule as noLocalStorageOfSecrets } from "./plugin/rules/security/no-localStorage-of-secrets.js";
import { rule as noPrivateEnvLeak } from "./plugin/rules/security/no-private-env-leak.js";
import { rule as serverOnlyImportInClient } from "./plugin/rules/sveltekit/server-only-import-in-client.js";
import { rule as noFetchInLoadWithoutEvent } from "./plugin/rules/sveltekit/no-fetch-in-load-without-event.js";
import { rule as csrfDisabledCheck } from "./plugin/rules/sveltekit/csrf-disabled-check.js";
import { rule as formActionWithoutValidation } from "./plugin/rules/sveltekit/form-action-without-validation.js";
import { rule as prerenderWithUserData } from "./plugin/rules/sveltekit/prerender-with-user-data.js";
import { rule as cookiesWithoutHttpOnly } from "./plugin/rules/sveltekit/cookies-without-httponly.js";
import { rule as noRedirectFromUntrustedInput } from "./plugin/rules/sveltekit/no-redirect-from-untrusted-input.js";
import { rule as weakCsp } from "./plugin/rules/sveltekit/weak-csp.js";
import { rule as componentTooLarge } from "./plugin/rules/architecture/component-too-large.js";
import { rule as noFetchInOnMount } from "./plugin/rules/svelte4/no-fetch-in-onMount.js";
import { rule as noMutationOfExportLet } from "./plugin/rules/svelte4/no-mutation-of-export-let.js";
import { rule as preferReactiveStatement } from "./plugin/rules/svelte4/prefer-reactive-statement.js";
import { rule as noLeakedSubscriptions } from "./plugin/rules/svelte4/no-leaked-subscriptions.js";

const universalRules: Record<string, Rule.RuleModule> = {
  "no-fetch-in-effect": noFetchInEffect,
  "prefer-derived-over-effect": preferDerivedOverEffect,
  "no-mutation-of-props": noMutationOfProps,
  "no-effect-without-cleanup": noEffectWithoutCleanup,
  "no-cascading-state-in-effect": noCascadingStateInEffect,
  "no-circular-reactivity": noCircularReactivity,
  "no-effect-chain": noEffectChain,
  "no-hydration-mismatch": noHydrationMismatch,
  "prefer-let-over-state": preferLetOverState,
  "no-array-index-as-each-key": noArrayIndexAsEachKey,
  "no-unsafe-html-binding": noUnsafeHtmlBinding,
  "no-href-javascript": noHrefJavascript,
  "no-eval": noEval,
  "no-secrets-in-client": noSecretsInClient,
  "no-unsafe-target-blank": noUnsafeTargetBlank,
  "no-localStorage-of-secrets": noLocalStorageOfSecrets,
  "component-too-large": componentTooLarge,
};

const sveltekitOnlyRules: Record<string, Rule.RuleModule> = {
  "server-only-import-in-client": serverOnlyImportInClient,
  "no-fetch-in-load-without-event": noFetchInLoadWithoutEvent,
  "no-sequential-await-in-load": noSequentialAwaitInLoad,
  "no-private-env-leak": noPrivateEnvLeak,
  "csrf-disabled-check": csrfDisabledCheck,
  "form-action-without-validation": formActionWithoutValidation,
  "prerender-with-user-data": prerenderWithUserData,
  "cookies-without-httponly": cookiesWithoutHttpOnly,
  "no-redirect-from-untrusted-input": noRedirectFromUntrustedInput,
  "weak-csp": weakCsp,
};

const svelte4OnlyRules: Record<string, Rule.RuleModule> = {
  "no-fetch-in-onMount": noFetchInOnMount,
  "no-mutation-of-export-let": noMutationOfExportLet,
  "prefer-reactive-statement": preferReactiveStatement,
  "no-leaked-subscriptions": noLeakedSubscriptions,
};

const allRules: Record<string, Rule.RuleModule> = {
  ...universalRules,
  ...sveltekitOnlyRules,
  ...svelte4OnlyRules,
};

const sharedSecurityRules: Linter.RulesRecord = {
  [`${RULE_PREFIX}/no-unsafe-html-binding`]: "error",
  [`${RULE_PREFIX}/no-href-javascript`]: "error",
  [`${RULE_PREFIX}/no-eval`]: "error",
  [`${RULE_PREFIX}/no-secrets-in-client`]: "error",
  [`${RULE_PREFIX}/no-unsafe-target-blank`]: "error",
  [`${RULE_PREFIX}/no-localStorage-of-secrets`]: "warn",
};

const sveltekitSecurityRules: Linter.RulesRecord = {
  [`${RULE_PREFIX}/server-only-import-in-client`]: "error",
  [`${RULE_PREFIX}/no-private-env-leak`]: "error",
  [`${RULE_PREFIX}/csrf-disabled-check`]: "error",
  [`${RULE_PREFIX}/form-action-without-validation`]: "warn",
  [`${RULE_PREFIX}/prerender-with-user-data`]: "error",
  [`${RULE_PREFIX}/cookies-without-httponly`]: "warn",
  [`${RULE_PREFIX}/no-redirect-from-untrusted-input`]: "error",
  [`${RULE_PREFIX}/weak-csp`]: "warn",
};

const recommendedRules: Linter.RulesRecord = {
  [`${RULE_PREFIX}/no-fetch-in-effect`]: "error",
  [`${RULE_PREFIX}/prefer-derived-over-effect`]: "warn",
  [`${RULE_PREFIX}/no-mutation-of-props`]: "error",
  [`${RULE_PREFIX}/no-effect-without-cleanup`]: "warn",
  [`${RULE_PREFIX}/no-cascading-state-in-effect`]: "warn",
  [`${RULE_PREFIX}/no-circular-reactivity`]: "warn",
  [`${RULE_PREFIX}/no-effect-chain`]: "warn",
  [`${RULE_PREFIX}/no-hydration-mismatch`]: "warn",
  [`${RULE_PREFIX}/prefer-let-over-state`]: "warn",
  [`${RULE_PREFIX}/no-array-index-as-each-key`]: "warn",
  ...sharedSecurityRules,
  [`${RULE_PREFIX}/component-too-large`]: "warn",
};

const sveltekitRules: Linter.RulesRecord = {
  ...recommendedRules,
  [`${RULE_PREFIX}/no-fetch-in-load-without-event`]: "error",
  [`${RULE_PREFIX}/no-sequential-await-in-load`]: "warn",
  ...sveltekitSecurityRules,
};

const svelte4UniversalRules: Linter.RulesRecord = {
  [`${RULE_PREFIX}/no-fetch-in-onMount`]: "error",
  [`${RULE_PREFIX}/no-mutation-of-export-let`]: "error",
  [`${RULE_PREFIX}/prefer-reactive-statement`]: "warn",
  [`${RULE_PREFIX}/no-leaked-subscriptions`]: "warn",
  [`${RULE_PREFIX}/no-array-index-as-each-key`]: "warn",
  ...sharedSecurityRules,
  [`${RULE_PREFIX}/component-too-large`]: "warn",
};

const svelte4SveltekitRules: Linter.RulesRecord = {
  ...svelte4UniversalRules,
  [`${RULE_PREFIX}/no-fetch-in-load-without-event`]: "error",
  ...sveltekitSecurityRules,
};

const securityOnlyRules: Linter.RulesRecord = {
  ...sharedSecurityRules,
  ...sveltekitSecurityRules,
};

const plugin = {
  meta: { name: RULE_PREFIX, version: "0.0.1" },
  rules: allRules,
} satisfies ESLint.Plugin;

const recommended: Linter.Config = {
  name: `${RULE_PREFIX}/recommended`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: recommendedRules,
};

const sveltekit: Linter.Config = {
  name: `${RULE_PREFIX}/sveltekit`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: sveltekitRules,
};

const svelte4: Linter.Config = {
  name: `${RULE_PREFIX}/svelte4`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: svelte4UniversalRules,
};

const svelte4Sveltekit: Linter.Config = {
  name: `${RULE_PREFIX}/svelte4-sveltekit`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: svelte4SveltekitRules,
};

const securityOnly: Linter.Config = {
  name: `${RULE_PREFIX}/security`,
  plugins: { [RULE_PREFIX]: plugin },
  rules: securityOnlyRules,
};

const exported: ESLint.Plugin & {
  configs: {
    recommended: Linter.Config;
    sveltekit: Linter.Config;
    svelte4: Linter.Config;
    "svelte4-sveltekit": Linter.Config;
    security: Linter.Config;
  };
} = {
  ...plugin,
  configs: {
    recommended,
    sveltekit,
    svelte4,
    "svelte4-sveltekit": svelte4Sveltekit,
    security: securityOnly,
  },
};

export default exported;
export { recommendedRules, sveltekitRules, securityOnlyRules };
export const allRuleIds = Object.keys(allRules);

export const SECURITY_RULE_IDS: string[] = Object.keys(sharedSecurityRules)
  .concat(Object.keys(sveltekitSecurityRules))
  .map((r) => r.replace(`${RULE_PREFIX}/`, ""));

/**
 * "Recommended" subset for the interactive scope prompt: every error-severity
 * rule plus a couple of warning rules that catch real, non-stylistic bugs.
 * Excludes opinionated/architecture warnings (component-too-large, cascading,
 * cleanup, array-index-as-key) — those belong in "All" or "Custom".
 */
export const RECOMMENDED_RULE_IDS: string[] = [
  "no-fetch-in-effect",
  "no-mutation-of-props",
  "no-circular-reactivity",
  "prefer-derived-over-effect",
  "no-fetch-in-onMount",
  "no-mutation-of-export-let",
  "no-unsafe-html-binding",
  "no-href-javascript",
  "no-eval",
  "no-secrets-in-client",
  "no-unsafe-target-blank",
  "server-only-import-in-client",
  "no-fetch-in-load-without-event",
  "no-private-env-leak",
  "csrf-disabled-check",
  "prerender-with-user-data",
  "no-redirect-from-untrusted-input",
];

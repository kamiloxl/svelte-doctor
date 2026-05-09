import type { ESLint, Linter, Rule } from "eslint";
import { RULE_PREFIX } from "./constants.js";
import { rule as noFetchInEffect } from "./plugin/rules/svelte5/no-fetch-in-effect.js";
import { rule as preferDerivedOverEffect } from "./plugin/rules/svelte5/prefer-derived-over-effect.js";
import { rule as noMutationOfProps } from "./plugin/rules/svelte5/no-mutation-of-props.js";
import { rule as noEffectWithoutCleanup } from "./plugin/rules/svelte5/no-effect-without-cleanup.js";
import { rule as noCascadingStateInEffect } from "./plugin/rules/svelte5/no-cascading-state-in-effect.js";
import { rule as noCircularReactivity } from "./plugin/rules/svelte5/no-circular-reactivity.js";
import { rule as noArrayIndexAsEachKey } from "./plugin/rules/performance/no-array-index-as-each-key.js";
import { rule as noUnsafeHtmlBinding } from "./plugin/rules/security/no-unsafe-html-binding.js";
import { rule as noHrefJavascript } from "./plugin/rules/security/no-href-javascript.js";
import { rule as serverOnlyImportInClient } from "./plugin/rules/sveltekit/server-only-import-in-client.js";
import { rule as noFetchInLoadWithoutEvent } from "./plugin/rules/sveltekit/no-fetch-in-load-without-event.js";
import { rule as componentTooLarge } from "./plugin/rules/architecture/component-too-large.js";

const universalRules: Record<string, Rule.RuleModule> = {
  "no-fetch-in-effect": noFetchInEffect,
  "prefer-derived-over-effect": preferDerivedOverEffect,
  "no-mutation-of-props": noMutationOfProps,
  "no-effect-without-cleanup": noEffectWithoutCleanup,
  "no-cascading-state-in-effect": noCascadingStateInEffect,
  "no-circular-reactivity": noCircularReactivity,
  "no-array-index-as-each-key": noArrayIndexAsEachKey,
  "no-unsafe-html-binding": noUnsafeHtmlBinding,
  "no-href-javascript": noHrefJavascript,
  "component-too-large": componentTooLarge,
};

const sveltekitOnlyRules: Record<string, Rule.RuleModule> = {
  "server-only-import-in-client": serverOnlyImportInClient,
  "no-fetch-in-load-without-event": noFetchInLoadWithoutEvent,
};

const allRules: Record<string, Rule.RuleModule> = {
  ...universalRules,
  ...sveltekitOnlyRules,
};

const recommendedRules: Linter.RulesRecord = {
  [`${RULE_PREFIX}/no-fetch-in-effect`]: "error",
  [`${RULE_PREFIX}/prefer-derived-over-effect`]: "warn",
  [`${RULE_PREFIX}/no-mutation-of-props`]: "error",
  [`${RULE_PREFIX}/no-effect-without-cleanup`]: "warn",
  [`${RULE_PREFIX}/no-cascading-state-in-effect`]: "warn",
  [`${RULE_PREFIX}/no-circular-reactivity`]: "warn",
  [`${RULE_PREFIX}/no-array-index-as-each-key`]: "warn",
  [`${RULE_PREFIX}/no-unsafe-html-binding`]: "error",
  [`${RULE_PREFIX}/no-href-javascript`]: "error",
  [`${RULE_PREFIX}/component-too-large`]: "warn",
};

const sveltekitRules: Linter.RulesRecord = {
  ...recommendedRules,
  [`${RULE_PREFIX}/server-only-import-in-client`]: "error",
  [`${RULE_PREFIX}/no-fetch-in-load-without-event`]: "error",
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

const exported: ESLint.Plugin & {
  configs: { recommended: Linter.Config; sveltekit: Linter.Config };
} = {
  ...plugin,
  configs: { recommended, sveltekit },
};

export default exported;
export { recommendedRules, sveltekitRules };
export const allRuleIds = Object.keys(allRules);

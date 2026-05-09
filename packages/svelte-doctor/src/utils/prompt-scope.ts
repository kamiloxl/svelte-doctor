import prompts from "prompts";
import pc from "picocolors";
import { RECOMMENDED_RULE_IDS, allRuleIds } from "../eslint-plugin.js";
import { allRuleMeta } from "../plugin/rule-meta.js";

export type ScopeChoice = "recommended" | "all" | "custom";

export interface SelectedScope {
  scope: ScopeChoice;
  enabledRuleIds: string[];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export async function promptScanScope(): Promise<SelectedScope | null> {
  const recommended = RECOMMENDED_RULE_IDS.filter((id) => allRuleIds.includes(id));

  const first = await prompts(
    {
      type: "select",
      name: "scope",
      message: "What should I scan for?",
      choices: [
        {
          title: pc.green("Recommended"),
          description: `${recommended.length} critical rules — bugs and security`,
          value: "recommended",
        },
        {
          title: pc.bold("All"),
          description: `${allRuleIds.length} rules — full diagnostics`,
          value: "all",
        },
        {
          title: pc.cyan("Custom"),
          description: "Pick rules yourself (multi-select)",
          value: "custom",
        },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        // Allow Ctrl+C to bubble up as "no selection".
        return false;
      },
    },
  );

  if (!first.scope) return null;

  if (first.scope === "all") {
    return { scope: "all", enabledRuleIds: allRuleIds };
  }
  if (first.scope === "recommended") {
    return { scope: "recommended", enabledRuleIds: recommended };
  }

  const meta = allRuleMeta();
  const second = await prompts(
    {
      type: "multiselect",
      name: "rules",
      message: "Pick rules — space to toggle, enter to confirm",
      choices: allRuleIds.map((id) => {
        const m = meta.find((x) => x.id === id);
        return {
          title: id,
          description: m ? truncate(m.description, 70) : undefined,
          value: id,
          selected: recommended.includes(id),
        };
      }),
      hint: "↑↓ to navigate, space to toggle, a to toggle all, enter to confirm",
      instructions: false,
      min: 0,
    },
    {
      onCancel: () => false,
    },
  );

  if (!second.rules) return null;
  return { scope: "custom", enabledRuleIds: second.rules };
}

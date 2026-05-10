import { registerRuleMeta } from "../rule-meta.js";

registerRuleMeta({
  id: "dependency-vulnerability",
  category: "security",
  defaultSeverity: "warning",
  description:
    "A direct or transitive dependency has a known vulnerability (reported by `npm audit` / `pnpm audit` / `yarn npm audit`).",
});

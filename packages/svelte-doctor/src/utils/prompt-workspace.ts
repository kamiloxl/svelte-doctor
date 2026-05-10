import prompts from "prompts";
import pc from "picocolors";
import { discoverWorkspaceProjects, type WorkspaceProject } from "./workspace.js";

const ALL_VALUE = "__all__";

export async function promptWorkspaceProjects(
  root: string,
): Promise<{ projects: WorkspaceProject[]; selectedNames: string[] | null } | null> {
  const all = await discoverWorkspaceProjects(root);
  if (all.length <= 1) {
    return { projects: all, selectedNames: null };
  }

  const choices = [
    {
      title: pc.bold("All projects"),
      description: `${all.length} workspace projects`,
      value: ALL_VALUE,
    },
    ...all.map((p) => ({
      title: p.name,
      description: pc.dim(p.root),
      value: p.name,
    })),
  ];

  const answer = await prompts(
    {
      type: "multiselect",
      name: "selected",
      message: "Which workspace project(s)?",
      choices,
      hint: "↑↓ to navigate, space to toggle, a to toggle all, enter to confirm",
      instructions: false,
      min: 1,
    },
    {
      onCancel: () => false,
    },
  );

  if (!answer.selected || answer.selected.length === 0) return null;
  if (answer.selected.includes(ALL_VALUE)) {
    return { projects: all, selectedNames: null };
  }
  const names = answer.selected as string[];
  return {
    projects: all.filter((p) => names.includes(p.name)),
    selectedNames: names,
  };
}

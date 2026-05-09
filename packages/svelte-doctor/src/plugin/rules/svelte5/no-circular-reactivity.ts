import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  AssignmentExpression,
  CallExpression,
  FunctionExpression,
  Identifier,
  Node,
  Pattern,
  VariableDeclarator,
} from "estree";
import { registerRuleMeta } from "../../rule-meta.js";

const RULE_ID = "no-circular-reactivity";

registerRuleMeta({
  id: RULE_ID,
  category: "state-effects",
  defaultSeverity: "warning",
  description:
    "Circular reactivity (state assigned in an effect that itself depends on the same state) causes infinite re-runs in Svelte 5.",
});

type Fn = ArrowFunctionExpression | FunctionExpression;

interface Edge {
  from: string;
  to: string;
  declarator: Node;
}

function calleeName(node: CallExpression): string | null {
  if (node.callee.type === "Identifier") return node.callee.name;
  if (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    node.callee.property.type === "Identifier"
  ) {
    return `${node.callee.object.name}.${node.callee.property.name}`;
  }
  return null;
}

function patternIdentifiers(pattern: Pattern, out: Set<string>): void {
  if (pattern.type === "Identifier") out.add(pattern.name);
  else if (pattern.type === "ObjectPattern") {
    for (const p of pattern.properties) {
      if (p.type === "Property") patternIdentifiers(p.value as Pattern, out);
      else patternIdentifiers(p.argument as Pattern, out);
    }
  } else if (pattern.type === "ArrayPattern") {
    for (const e of pattern.elements) if (e) patternIdentifiers(e as Pattern, out);
  } else if (pattern.type === "AssignmentPattern") {
    patternIdentifiers(pattern.left as Pattern, out);
  } else if (pattern.type === "RestElement") {
    patternIdentifiers(pattern.argument as Pattern, out);
  }
}

function collectIdentifiersIn(node: Node): Set<string> {
  const found = new Set<string>();
  const stack: unknown[] = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    const n = current as Node & { type?: string };
    if (!n.type) continue;
    if (n.type === "Identifier") {
      found.add((n as Identifier).name);
      continue;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      const child = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) if (item && typeof item === "object") stack.push(item);
      } else if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }
  return found;
}

function rootIdentifier(
  node: AssignmentExpression["left"],
): Identifier | null {
  if (node.type === "Identifier") return node;
  if (node.type === "MemberExpression") {
    return rootIdentifier(node.object as AssignmentExpression["left"]);
  }
  return null;
}

function findCycle(edges: Edge[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const dfs = (start: string): string[] | null => {
    const stack: { node: string; iter: Iterator<string> }[] = [
      { node: start, iter: (adjacency.get(start) ?? [])[Symbol.iterator]() },
    ];
    color.set(start, GRAY);
    parent.set(start, null);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = top.iter.next();
      if (next.done) {
        color.set(top.node, BLACK);
        stack.pop();
        continue;
      }
      const child = next.value;
      const c = color.get(child) ?? WHITE;
      if (c === GRAY) {
        const cycle: string[] = [child];
        let cur: string | null = top.node;
        while (cur && cur !== child) {
          cycle.push(cur);
          cur = parent.get(cur) ?? null;
        }
        cycle.push(child);
        return cycle.reverse();
      }
      if (c === WHITE) {
        color.set(child, GRAY);
        parent.set(child, top.node);
        stack.push({
          node: child,
          iter: (adjacency.get(child) ?? [])[Symbol.iterator](),
        });
      }
    }
    return null;
  };
  for (const node of adjacency.keys()) {
    if (color.get(node) !== BLACK) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

export const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Detect circular dependencies between $state, $derived and $effect.",
      recommended: true,
    },
    schema: [],
    messages: {
      circular:
        "Circular reactivity detected: {{cycle}}. This will cause an infinite re-run loop.",
    },
  },
  create(context) {
    const stateNames = new Set<string>();
    const edges: Edge[] = [];
    let firstReactiveDeclarator: Node | null = null;

    return {
      VariableDeclarator(node: VariableDeclarator) {
        if (
          node.init?.type === "CallExpression" &&
          (node.init as CallExpression).callee.type === "Identifier"
        ) {
          const name = ((node.init as CallExpression).callee as Identifier).name;
          if (name === "$state") {
            patternIdentifiers(node.id as Pattern, stateNames);
            firstReactiveDeclarator ??= node;
          } else if (name === "$derived") {
            const targets = new Set<string>();
            patternIdentifiers(node.id as Pattern, targets);
            const arg = (node.init as CallExpression).arguments[0];
            const reads = arg ? collectIdentifiersIn(arg as Node) : new Set<string>();
            for (const target of targets) {
              for (const read of reads) {
                if (read === target) continue;
                edges.push({ from: read, to: target, declarator: node });
              }
            }
            firstReactiveDeclarator ??= node;
          }
        }
      },
      CallExpression(node) {
        const name = calleeName(node as CallExpression);
        if (name !== "$effect" && name !== "$effect.pre") return;
        const arg = (node as CallExpression).arguments[0];
        if (!arg) return;
        if (
          arg.type !== "ArrowFunctionExpression" &&
          arg.type !== "FunctionExpression"
        ) {
          return;
        }
        const fn = arg as Fn;
        const writes = new Set<string>();
        const stack: unknown[] = [fn.body];
        while (stack.length) {
          const current = stack.pop();
          if (!current || typeof current !== "object") continue;
          const n = current as Node & { type?: string };
          if (!n.type) continue;
          if (n.type === "AssignmentExpression") {
            const root = rootIdentifier((n as AssignmentExpression).left);
            if (root) writes.add(root.name);
          }
          for (const key of Object.keys(n)) {
            if (key === "loc" || key === "range" || key === "parent") continue;
            const child = (n as unknown as Record<string, unknown>)[key];
            if (Array.isArray(child)) {
              for (const item of child) if (item && typeof item === "object") stack.push(item);
            } else if (child && typeof child === "object") {
              stack.push(child);
            }
          }
        }
        const reads = collectIdentifiersIn(fn.body);
        for (const target of writes) {
          for (const read of reads) {
            if (read === target) continue;
            edges.push({ from: read, to: target, declarator: node as Node });
          }
        }
        firstReactiveDeclarator ??= node as Node;
      },
      "Program:exit"() {
        if (!firstReactiveDeclarator) return;
        const stateEdges = edges.filter(
          (e) => stateNames.has(e.from) || stateNames.has(e.to),
        );
        if (!stateEdges.length) return;
        const cycle = findCycle(stateEdges);
        if (!cycle) return;
        context.report({
          node: firstReactiveDeclarator as Rule.Node,
          messageId: "circular",
          data: { cycle: cycle.join(" → ") },
        });
      },
    };
  },
};

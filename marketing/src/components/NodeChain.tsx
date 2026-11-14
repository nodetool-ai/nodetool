import React from "react";
import type { TemplateGraph } from "@/data/templates";
import { categoryFor } from "./flow/nodeCategory";

/** Inputs and constants say little about what a workflow does. */
const SETUP_NODE = /\.(input|constant)\./i;

/** Distinct working-node titles of a graph in canvas order, left to right. */
function chainOf(graph: TemplateGraph): { title: string; type: string }[] {
  const seen = new Set<string>();
  return graph.nodes
    .filter((node) => !node.isComment && !SETUP_NODE.test(node.type))
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((node) => {
      if (seen.has(node.title)) {
        return false;
      }
      seen.add(node.title);
      return true;
    })
    .map((node) => ({ title: node.title, type: node.type }));
}

/**
 * A one-line preview of a shipped workflow: its node types as colored chips in
 * canvas order, so a hub card shows the graph it opens without drawing it.
 */
export default function NodeChain({ graph, limit = 4 }: { graph: TemplateGraph; limit?: number }) {
  const chain = chainOf(graph);
  const shown = chain.slice(0, limit);
  const rest = chain.length - shown.length;
  return (
    <ol aria-label="Nodes in this workflow" className="flex flex-wrap items-center gap-1.5">
      {shown.map((node) => {
        const { icon: Icon, color } = categoryFor(node.type);
        return (
          <li
            key={node.title}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-200"
          >
            <Icon className="h-3.5 w-3.5" style={{ color }} aria-hidden />
            {node.title}
          </li>
        );
      })}
      {rest > 0 ? <li className="text-xs text-slate-400">+{rest} more</li> : null}
    </ol>
  );
}

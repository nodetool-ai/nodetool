/**
 * Normalize a raw saved graph into the kernel's descriptor contract: node
 * properties under `properties` (the editor stores them under `data`), edges
 * carrying `edge_type`, and editor-only nodes (Comment/Group/Reroute) pruned
 * the way the web editor prunes them at serialize time.
 *
 * Ported from `packages/websocket/src/headless-job-runner.ts`'s
 * `normalizeRunnableGraph` / `packages/cli/src/debug/server-runner.ts`'s
 * inline filter — the two call sites this logic drifted between before this
 * package existed.
 */
import { isEditorOnlyType } from "@nodetool-ai/node-sdk";
import type { Edge, GraphData, NodeDescriptor } from "@nodetool-ai/protocol";
import type { RawGraphInput } from "./types.js";

export function normalizeGraph(graph: RawGraphInput): GraphData {
  // `RawGraphInput` declares two arrays; the stored row or file behind it has
  // never been checked against that, and a non-array used to reach `.filter()`.
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
    throw new Error("Invalid workflow: nodes and edges must be arrays");
  }

  const executable = graph.nodes.filter(
    (n) => !isEditorOnlyType(String(n["type"] ?? ""))
  );
  const keep = new Set(executable.map((n) => String(n["id"] ?? "")));

  const nodes: NodeDescriptor[] = executable.map((n) => {
    const record = { ...n };
    if (record["properties"] === undefined && record["data"] !== undefined) {
      const { data, ...rest } = record;
      return { ...rest, properties: data } as unknown as NodeDescriptor;
    }
    return record as unknown as NodeDescriptor;
  });

  const edges: Edge[] = graph.edges
    .filter(
      (e) =>
        keep.has(String(e["source"] ?? "")) &&
        keep.has(String(e["target"] ?? ""))
    )
    .map((e) => {
      const record = { ...e };
      const rawEdgeType = record["edge_type"] ?? record["type"];
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type: _type, ...rest } = record;
      return { ...rest, edge_type } as unknown as Edge;
    });

  return { nodes, edges };
}

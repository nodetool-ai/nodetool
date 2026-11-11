// Reuse the production TypeScript rules inside the embedded guest.
import { applyDynamicSlotTypes } from "../../../packages/execution-core/src/dynamic-slots.ts";
import { rewriteBypassedNodes } from "../../../packages/execution-core/src/graph-utils.ts";
export { applyDynamicSlotTypes, rewriteBypassedNodes };
import { normalizeNodes, normalizeEdges } from "../../../packages/core-nodes/src/nodes/run-inner-graph.ts";
import { collapseComfyGraph } from "@nodetool-ai/protocol";
export function prepareInnerGraph(graph) {
  return collapseComfyGraph({ nodes: normalizeNodes(graph.nodes), edges: normalizeEdges(graph.edges) });
}

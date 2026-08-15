import { Edge } from "@xyflow/react";

/**
 * Every node body and property widget on the canvas asks "what is wired into
 * my node?", and each used to scan the whole `edges` array to answer — so one
 * edge change re-scanned the graph once per rendered widget. This groups the
 * edges by target once per `edges` array identity instead.
 *
 * The store always replaces `edges` immutably (filter/map/spread), so the
 * array reference is a sound cache key.
 */
const indexCache = new WeakMap<Edge[], Map<string, Edge[]>>();

const EMPTY_EDGES: Edge[] = [];

/**
 * Edges targeting `nodeId`, in graph order. The array is shared with every
 * other caller for this `edges` identity — treat it as read-only.
 */
export const edgesTargeting = (edges: Edge[], nodeId: string): Edge[] => {
  let byTarget = indexCache.get(edges);
  if (!byTarget) {
    byTarget = new Map();
    for (const edge of edges) {
      const existing = byTarget.get(edge.target);
      if (existing) {
        existing.push(edge);
      } else {
        byTarget.set(edge.target, [edge]);
      }
    }
    indexCache.set(edges, byTarget);
  }
  return byTarget.get(nodeId) ?? EMPTY_EDGES;
};

export const isHandleConnected = (
  edges: Edge[],
  nodeId: string,
  handle: string
): boolean =>
  edgesTargeting(edges, nodeId).some((edge) => edge.targetHandle === handle);

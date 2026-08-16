import { Edge } from "@xyflow/react";

/**
 * Every node body and property widget on the canvas asks "what is wired into
 * my node?", and each used to scan the whole `edges` array to answer — so one
 * edge change re-scanned the graph once per rendered widget. This groups the
 * edges by target — and, for the "what do I feed?" direction, by source — once
 * per `edges` array identity instead.
 *
 * The store always replaces `edges` immutably (filter/map/spread), so the
 * array reference is a sound cache key.
 */
const indexCache = new WeakMap<Edge[], Map<string, Edge[]>>();
const sourceIndexCache = new WeakMap<Edge[], Map<string, Edge[]>>();

const EMPTY_EDGES: Edge[] = [];

const groupBy = (
  edges: Edge[],
  key: (edge: Edge) => string
): Map<string, Edge[]> => {
  const grouped = new Map<string, Edge[]>();
  for (const edge of edges) {
    const k = key(edge);
    const existing = grouped.get(k);
    if (existing) {
      existing.push(edge);
    } else {
      grouped.set(k, [edge]);
    }
  }
  return grouped;
};

/**
 * Edges targeting `nodeId`, in graph order. The array is shared with every
 * other caller for this `edges` identity — treat it as read-only.
 */
export const edgesTargeting = (edges: Edge[], nodeId: string): Edge[] => {
  let byTarget = indexCache.get(edges);
  if (!byTarget) {
    byTarget = groupBy(edges, (edge) => edge.target);
    indexCache.set(edges, byTarget);
  }
  return byTarget.get(nodeId) ?? EMPTY_EDGES;
};

/**
 * Edges leaving `nodeId`, in graph order. Same caching and read-only contract
 * as `edgesTargeting`, keyed on `source` instead.
 */
export const edgesFrom = (edges: Edge[], nodeId: string): Edge[] => {
  let bySource = sourceIndexCache.get(edges);
  if (!bySource) {
    bySource = groupBy(edges, (edge) => edge.source);
    sourceIndexCache.set(edges, bySource);
  }
  return bySource.get(nodeId) ?? EMPTY_EDGES;
};

export const isHandleConnected = (
  edges: Edge[],
  nodeId: string,
  handle: string
): boolean =>
  edgesTargeting(edges, nodeId).some((edge) => edge.targetHandle === handle);

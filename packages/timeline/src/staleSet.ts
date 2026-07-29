/**
 * Stale-set computation for timeline clips.
 *
 * Given a workflow graph and two snapshots of paramOverrides
 * (the one baked into the last generated version vs. the current live values),
 * returns the set of node IDs that are dirty or stale.
 *
 * Rules:
 *  - An Input* node is **dirty** when its parameter value in
 *    `currentParamOverrides` differs from `paramOverridesSnapshot`.
 *  - A non-Input node is **stale** when any of its transitive upstream
 *    Input* nodes are dirty (via the workflow's directed edges).
 *
 * This is a pure function with no side effects and no platform dependencies.
 */

export interface StaleSetGraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  dynamic_properties?: Record<string, unknown>;
}

export interface StaleSetGraphEdge {
  source: string;
  target: string;
}

export interface StaleSetGraph {
  nodes: StaleSetGraphNode[];
  edges?: StaleSetGraphEdge[];
}

/** Returns true for nodes in the `nodetool.input.*` namespace. */
function isInputNodeType(nodeType: string): boolean {
  return nodeType.startsWith("nodetool.input.");
}

/**
 * Extract the workflow parameter name from an Input* node.
 * Mirrors the server-side `inputNodeName()` in `packages/websocket`.
 */
function extractParamName(node: StaleSetGraphNode): string | null {
  return (
    (node.data?.name as string | undefined) ??
    (node.dynamic_properties?.name as string | undefined) ??
    null
  );
}

/**
 * Value equality check suitable for JSON-serialisable paramOverride values.
 * Uses JSON serialisation so plain objects, arrays, and primitives all compare
 * by value rather than reference.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Compute the set of node IDs that are dirty or stale.
 *
 * @param graph - The workflow graph (nodes + directed edges)
 * @param paramOverridesSnapshot - The paramOverrides snapshot from the last
 *   generated {@link ClipVersion} (`version.paramOverridesSnapshot`).
 * @param currentParamOverrides - The current live `clip.paramOverrides`.
 * @returns Set of node IDs that are dirty (Input* nodes whose value changed)
 *   or stale (non-input nodes that transitively depend on a dirty Input* node).
 */
export function computeStaleSet(
  graph: StaleSetGraph,
  paramOverridesSnapshot: Record<string, unknown>,
  currentParamOverrides: Record<string, unknown>
): Set<string> {
  const stale = new Set<string>();

  const nodeById = new Map<string, StaleSetGraphNode>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
  }

  // Build adjacency list: source nodeId → Set<target nodeId>
  const downstreamOf = new Map<string, Set<string>>();
  for (const edge of (graph.edges ?? [])) {
    if (!downstreamOf.has(edge.source)) {
      downstreamOf.set(edge.source, new Set());
    }
    downstreamOf.get(edge.source)!.add(edge.target);
  }

  // Phase 1 — find dirty Input* nodes
  const dirtyInputIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!isInputNodeType(node.type)) {
      continue;
    }
    const paramName = extractParamName(node);
    if (paramName === null) {
      continue;
    }
    const snapshotVal = paramOverridesSnapshot[paramName];
    const currentVal = currentParamOverrides[paramName];
    if (!valuesEqual(snapshotVal, currentVal)) {
      dirtyInputIds.add(node.id);
      stale.add(node.id);
    }
  }

  if (dirtyInputIds.size === 0) {
    return stale;
  }

  // Phase 2 — BFS to mark all downstream nodes as stale
  const queue = [...dirtyInputIds];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const targets = downstreamOf.get(nodeId);
    if (!targets) {
      continue;
    }
    for (const targetId of targets) {
      if (!stale.has(targetId)) {
        stale.add(targetId);
        queue.push(targetId);
      }
    }
  }

  return stale;
}

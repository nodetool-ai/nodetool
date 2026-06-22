/**
 * Pure graph helpers for the Set Variable / Get Variable nodes.
 *
 * A Set Variable node writes a value onto the workflow's shared processing
 * context; a Get Variable node (or a Prompt node referencing `{{ name }}`)
 * reads it. Because execution follows the graph's edges, a reader only sees a
 * variable when its Set Variable node is *upstream* of it. These helpers walk
 * the edges backwards from a node and collect the names that Set Variable
 * ancestors declare, so the editor can offer exactly those variables.
 *
 * Kept free of React / store imports so it is trivially unit-testable.
 */
import { SET_VARIABLE_NODE_TYPE } from "../../../constants/nodeTypes";

export interface VariableGraphNode {
  id: string;
  type?: string;
  data?: { properties?: Record<string, unknown> | null } | null;
}

export interface VariableGraphEdge {
  source: string;
  target: string;
}

/** The literal variable name configured on a Set Variable node, or "". */
export const readVariableName = (
  node: VariableGraphNode | undefined
): string => {
  const raw = node?.data?.properties?.name;
  return typeof raw === "string" ? raw.trim() : "";
};

/**
 * Names of variables set by Set Variable nodes upstream (transitive
 * ancestors) of `nodeId`. Returns a de-duplicated, alphabetically sorted list.
 */
export const collectUpstreamVariableNames = (
  nodeId: string,
  nodes: readonly VariableGraphNode[],
  edges: readonly VariableGraphEdge[]
): string[] => {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const edgesByTarget = new Map<string, VariableGraphEdge[]>();
  for (const edge of edges) {
    const list = edgesByTarget.get(edge.target);
    if (list) {
      list.push(edge);
    } else {
      edgesByTarget.set(edge.target, [edge]);
    }
  }

  const names = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const edge of edgesByTarget.get(current) ?? []) {
      const sourceId = edge.source;
      if (visited.has(sourceId)) {
        continue;
      }
      visited.add(sourceId);
      const sourceNode = nodeById.get(sourceId);
      if (sourceNode?.type === SET_VARIABLE_NODE_TYPE) {
        const name = readVariableName(sourceNode);
        if (name) {
          names.add(name);
        }
      }
      // Keep walking past the setter so chained Set Variable nodes upstream of
      // it are also discovered.
      stack.push(sourceId);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
};

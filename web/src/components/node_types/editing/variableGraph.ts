/**
 * Pure graph helpers for the Set Variable / Get Variable nodes.
 *
 * A Set Variable node publishes a value onto a named channel; a Get Variable
 * node (or a Prompt node referencing `{{ name }}`) reads it. The channel is
 * shared by the whole run, so a variable defined by any Set Variable node is
 * readable anywhere in the workflow — the editor offers every defined variable
 * regardless of graph position. A variable's type is inferred from whatever is
 * wired into its Set Variable's `value` input, so reads are type-checked.
 *
 * Kept free of React / store imports so it is trivially unit-testable.
 */
import { SET_VARIABLE_NODE_TYPE } from "../../../constants/nodeTypes";
import type { TypeMetadata } from "../../../stores/ApiTypes";

export interface VariableGraphNode {
  id: string;
  type?: string;
  data?: { properties?: Record<string, unknown> | null } | null;
}

export interface VariableGraphEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Fallback type for an unconnected or conflicting variable. */
export const ANY_TYPE: TypeMetadata = {
  type: "any",
  optional: false,
  type_args: []
};

/** Resolve the type of a source node's output handle (for type inference). */
export type OutputTypeResolver = (
  sourceId: string,
  sourceHandle: string
) => TypeMetadata | undefined;

/** The literal variable name configured on a Set Variable node, or "". */
export const readVariableName = (
  node: VariableGraphNode | undefined
): string => {
  const raw = node?.data?.properties?.name;
  return typeof raw === "string" ? raw.trim() : "";
};

/**
 * Names of every variable defined by a Set Variable node anywhere in the
 * workflow. Returns a de-duplicated, alphabetically sorted list.
 */
export const collectVariableNames = (
  nodes: readonly VariableGraphNode[]
): string[] => {
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.type !== SET_VARIABLE_NODE_TYPE) {
      continue;
    }
    const name = readVariableName(node);
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

/**
 * Infer each variable's type from whatever is wired into the matching Set
 * Variable's `value` input. Unconnected → `any`. Two setters of one name with
 * different types collapse to `any` (a conflict the editor can surface).
 */
export const inferVariableTypes = (
  nodes: readonly VariableGraphNode[],
  edges: readonly VariableGraphEdge[],
  resolveOutputType: OutputTypeResolver
): Map<string, TypeMetadata> => {
  const valueEdgeByTarget = new Map<string, VariableGraphEdge>();
  for (const edge of edges) {
    if (edge.targetHandle === "value") {
      valueEdgeByTarget.set(edge.target, edge);
    }
  }

  const result = new Map<string, TypeMetadata>();
  const conflicted = new Set<string>();
  for (const node of nodes) {
    if (node.type !== SET_VARIABLE_NODE_TYPE) {
      continue;
    }
    const name = readVariableName(node);
    if (!name || conflicted.has(name)) {
      continue;
    }
    const edge = valueEdgeByTarget.get(node.id);
    const type =
      (edge && resolveOutputType(edge.source, edge.sourceHandle ?? "")) ||
      ANY_TYPE;
    const existing = result.get(name);
    if (existing && existing.type !== type.type) {
      result.set(name, ANY_TYPE);
      conflicted.add(name);
    } else {
      result.set(name, type);
    }
  }
  return result;
};

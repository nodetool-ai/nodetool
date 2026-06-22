/**
 * Pure graph helpers for the Set Variable / Get Variable nodes.
 *
 * A Set Variable node writes a value onto the workflow's shared processing
 * context; a Get Variable node (or a Prompt node referencing `{{ name }}`)
 * reads it. The context is shared by the whole run, so a variable defined by
 * any Set Variable node is readable anywhere in the workflow — the editor
 * therefore offers every defined variable regardless of graph position.
 * (Whether the value is *set in time* still depends on execution order, which
 * follows the edges — hence the Get Variable node's `trigger` input.)
 *
 * Kept free of React / store imports so it is trivially unit-testable.
 */
import { SET_VARIABLE_NODE_TYPE } from "../../../constants/nodeTypes";

export interface VariableGraphNode {
  id: string;
  type?: string;
  data?: { properties?: Record<string, unknown> | null } | null;
}

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

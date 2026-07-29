/**
 * Extracts the bindable inputs and outputs of a workflow graph.
 *
 * Inputs map to state keys the app writes (and feeds to a run); outputs map to
 * state keys the streaming runner writes back into. Both are keyed by the node's
 * `name` so widget bindings stay stable across edits.
 */
import { Node, Workflow } from "../../stores/ApiTypes";
import { getWorkflowInputKind, WorkflowInputKind } from "./inputKinds";
import { parseNodeUIProperties } from "../../stores/nodeUiDefaults";

export interface WorkflowInputIO {
  nodeId: string;
  nodeType: string;
  name: string;
  label: string;
  kind: WorkflowInputKind;
  description?: string;
  min?: number;
  max?: number;
  /** StringInput character limit; 0 or absent = unlimited. */
  maxLength?: number;
  /** StringInput preferred rendering (line_mode / legacy multiline flag). */
  multiline?: boolean;
  options?: string[];
  /** SelectInput enum type name for type matching. */
  enumTypeName?: string;
  defaultValue?: unknown;
}

export interface WorkflowOutputIO {
  nodeId: string;
  nodeType: string;
  name: string;
  label: string;
}

export interface WorkflowIO {
  inputs: WorkflowInputIO[];
  outputs: WorkflowOutputIO[];
}

const EMPTY_IO: WorkflowIO = { inputs: [], outputs: [] };

const nodeName = (node: Node): string => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const name = data.name;
  return typeof name === "string" && name.length > 0 ? name : node.id;
};

const isOutputNode = (type: string): boolean =>
  type.includes(".output.") || type === "nodetool.workflows.base_node.Preview";

export const extractWorkflowIO = (workflow?: Workflow | null): WorkflowIO => {
  const nodes = workflow?.graph?.nodes;
  if (!nodes) return EMPTY_IO;

  const inputs: WorkflowInputIO[] = [];
  const outputs: WorkflowOutputIO[] = [];

  for (const node of nodes) {
    if (parseNodeUIProperties(node.ui_properties)?.bypassed) continue;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const name = nodeName(node);
    const label = typeof data.label === "string" && data.label ? data.label : name;

    const kind = getWorkflowInputKind(node.type);
    if (kind) {
      inputs.push({
        nodeId: node.id,
        nodeType: node.type,
        name,
        label,
        kind,
        description:
          typeof data.description === "string" && data.description
            ? data.description
            : undefined,
        min: typeof data.min === "number" ? data.min : undefined,
        max: typeof data.max === "number" ? data.max : undefined,
        maxLength:
          typeof data.max_length === "number" &&
          Number.isFinite(data.max_length)
            ? Math.max(0, Math.floor(data.max_length))
            : undefined,
        multiline:
          data.line_mode === "multi_line" ||
          data.line_mode === "multiline" ||
          data.multiline === true
            ? true
            : undefined,
        options: Array.isArray(data.options)
          ? (data.options as string[])
          : undefined,
        enumTypeName:
          typeof data.enum_type_name === "string"
            ? data.enum_type_name
            : undefined,
        defaultValue: data.value
      });
      continue;
    }

    if (isOutputNode(node.type)) {
      outputs.push({ nodeId: node.id, nodeType: node.type, name, label });
    }
  }

  return { inputs, outputs };
};

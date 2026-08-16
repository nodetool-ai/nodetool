/**
 * The bindable surface of a workflow graph: the Input nodes an app writes, the
 * Output nodes it displays, and the SetVariable channels it can read.
 *
 * Port of `web/src/components/appbuilder/workflowIO.ts` over the mobile
 * `Workflow` shape. Widget bindings resolve against this, so the same app
 * document renders the same way on both clients.
 */
import type { Node, Workflow } from "../../types/workflow";
import { getWorkflowInputKind, WorkflowInputKind } from "./inputKinds";

/**
 * A value an input node carries: NodeTool's property types are scalars, media
 * refs, and lists or dicts of those.
 */
export type InputValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | InputValue[]
  | { [key: string]: InputValue };

export interface WorkflowInputIO {
  nodeId: string;
  nodeType: string;
  name: string;
  label: string;
  kind: WorkflowInputKind;
  description?: string;
  min?: number;
  max?: number;
  multiline?: boolean;
  options?: string[];
  defaultValue?: InputValue;
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

export const EMPTY_IO: WorkflowIO = { inputs: [], outputs: [] };

const SET_VARIABLE_NODE_TYPE = "nodetool.workflows.base_node.SetVariable";

const nodeData = (node: Node): Record<string, unknown> =>
  (node.data ?? {}) as Record<string, unknown>;

const nodeName = (node: Node): string => {
  const name = nodeData(node).name;
  return typeof name === "string" && name.length > 0 ? name : node.id;
};

const isBypassed = (node: Node): boolean => {
  const ui = node.ui_properties;
  return (
    typeof ui === "object" &&
    ui !== null &&
    (ui as Record<string, unknown>).bypassed === true
  );
};

const isOutputNode = (type: string): boolean =>
  type.includes(".output.") || type === "nodetool.workflows.base_node.Preview";

export const extractWorkflowIO = (workflow?: Workflow | null): WorkflowIO => {
  const nodes = workflow?.graph?.nodes;
  if (!nodes) {return EMPTY_IO;}

  const inputs: WorkflowInputIO[] = [];
  const outputs: WorkflowOutputIO[] = [];

  for (const node of nodes) {
    if (isBypassed(node)) {continue;}
    const data = nodeData(node);
    const name = nodeName(node);
    const label =
      typeof data.label === "string" && data.label ? data.label : name;

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
        multiline:
          data.line_mode === "multi_line" ||
          data.line_mode === "multiline" ||
          data.multiline === true
            ? true
            : undefined,
        options: Array.isArray(data.options)
          ? (data.options as string[])
          : undefined,
        // SAFETY: `value` is the input node's stored property value, which
        // NodeTool restricts to its own property types.
        defaultValue: data.value as InputValue,
      });
      continue;
    }

    if (isOutputNode(node.type)) {
      outputs.push({ nodeId: node.id, nodeType: node.type, name, label });
    }
  }

  return { inputs, outputs };
};

/** SetVariable channel names the graph publishes — a legacy variable source. */
export const extractVariableNames = (workflow?: Workflow | null): string[] => {
  const nodes = workflow?.graph?.nodes;
  if (!nodes) {return [];}
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.type !== SET_VARIABLE_NODE_TYPE) {continue;}
    const data = nodeData(node);
    const nested = (data.properties as Record<string, unknown> | undefined)
      ?.name;
    const raw = typeof nested === "string" ? nested : data.name;
    if (typeof raw === "string" && raw.trim()) {names.add(raw.trim());}
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

/**
 * The value an untouched input runs with: the node's saved default, else the
 * fallback the control displays. Seeding only fills empty slots, so a form the
 * user never touched runs with exactly what it shows.
 */
export const seedInputValue = (input: WorkflowInputIO): InputValue => {
  if (input.defaultValue !== undefined && input.defaultValue !== null) {
    return input.defaultValue;
  }
  switch (input.kind) {
    case "boolean":
      return false;
    case "integer":
    case "float":
      return input.min ?? 0;
    case "select":
      return input.options?.[0];
    default:
      return undefined;
  }
};

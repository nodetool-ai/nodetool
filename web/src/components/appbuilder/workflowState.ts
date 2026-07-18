/**
 * The bindable surface of a workflow for the app builder:
 *  - inputs  → input nodes (widgets that write feed a run)
 *  - outputs → output nodes (widgets that read display streamed results)
 *  - variables → SetVariable channel names (any other app state)
 *  - nodes → every graph node, so write widgets can bind straight to any
 *    node property (see nodeBinding.ts)
 */
import { Workflow } from "../../stores/ApiTypes";
import {
  SET_VARIABLE_NODE_TYPE,
  COMMENT_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../constants/nodeTypes";
import { parseNodeUIProperties } from "../../stores/nodeUiDefaults";
import { extractWorkflowIO, WorkflowInputIO, WorkflowOutputIO } from "./workflowIO";

/** A graph node offered by the node-property binding picker. */
export interface BindableGraphNode {
  id: string;
  type: string;
  /** User-given node title (ui_properties), when set. */
  title?: string;
}

export interface WorkflowState {
  inputs: WorkflowInputIO[];
  outputs: WorkflowOutputIO[];
  variables: string[];
  nodes: BindableGraphNode[];
}

const EMPTY: WorkflowState = {
  inputs: [],
  outputs: [],
  variables: [],
  nodes: []
};

/** Read a SetVariable node's name from either the API (flat) or editor shape. */
const readVariableName = (node: { type?: string; data?: unknown }): string => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const nested = (data.properties as Record<string, unknown> | undefined)?.name;
  const flat = data.name;
  const raw = typeof nested === "string" ? nested : flat;
  return typeof raw === "string" ? raw.trim() : "";
};

export const extractVariableNames = (workflow?: Workflow | null): string[] => {
  const nodes = workflow?.graph?.nodes;
  if (!nodes) return [];
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.type !== SET_VARIABLE_NODE_TYPE) continue;
    const name = readVariableName(node);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

const NON_BINDABLE_TYPES = new Set([COMMENT_NODE_TYPE, GROUP_NODE_TYPE]);

export const extractBindableNodes = (
  workflow?: Workflow | null
): BindableGraphNode[] => {
  const nodes = workflow?.graph?.nodes;
  if (!nodes) return [];
  const bindable: BindableGraphNode[] = [];
  for (const node of nodes) {
    if (NON_BINDABLE_TYPES.has(node.type)) continue;
    const title = parseNodeUIProperties(node.ui_properties)?.title;
    bindable.push({
      id: node.id,
      type: node.type,
      title: typeof title === "string" && title ? title : undefined
    });
  }
  return bindable;
};

export const extractWorkflowState = (
  workflow?: Workflow | null
): WorkflowState => {
  if (!workflow) return EMPTY;
  const io = extractWorkflowIO(workflow);
  return {
    inputs: io.inputs,
    outputs: io.outputs,
    variables: extractVariableNames(workflow),
    nodes: extractBindableNodes(workflow)
  };
};

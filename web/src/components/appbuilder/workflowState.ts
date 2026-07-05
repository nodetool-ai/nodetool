/**
 * The bindable surface of a workflow for the app builder:
 *  - inputs  → input nodes (widgets that write feed a run)
 *  - outputs → output nodes (widgets that read display streamed results)
 *  - variables → SetVariable channel names (any other app state)
 *
 * Bindings always reference one of these — the workflow must declare the node
 * first. There are no free-form state keys.
 */
import { Workflow } from "../../stores/ApiTypes";
import { SET_VARIABLE_NODE_TYPE } from "../../constants/nodeTypes";
import { extractWorkflowIO, WorkflowInputIO, WorkflowOutputIO } from "./workflowIO";

export interface WorkflowState {
  inputs: WorkflowInputIO[];
  outputs: WorkflowOutputIO[];
  variables: string[];
}

const EMPTY: WorkflowState = { inputs: [], outputs: [], variables: [] };

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

export const extractWorkflowState = (
  workflow?: Workflow | null
): WorkflowState => {
  if (!workflow) return EMPTY;
  const io = extractWorkflowIO(workflow);
  return {
    inputs: io.inputs,
    outputs: io.outputs,
    variables: extractVariableNames(workflow)
  };
};

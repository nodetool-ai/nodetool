// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Workflow — nodetool.workflows.workflow_node.Workflow
export interface WorkflowInputs {
  workflow_id?: Connectable<string>;
  workflow_json?: Connectable<Record<string, unknown>>;
}

export interface WorkflowOutputs {
}

export function workflow(inputs: WorkflowInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WorkflowOutputs> {
  return createNode("nodetool.workflows.workflow_node.Workflow", inputs as Record<string, unknown>, { outputNames: [], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

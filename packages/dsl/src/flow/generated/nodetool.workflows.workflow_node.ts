// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Workflow — nodetool.workflows.workflow_node.Workflow
export type WorkflowInputs = {
  workflow_id?: string;
  workflow_json?: Record<string, unknown>;
};

export interface WorkflowOutputs {
}

export function workflow(inputs: WorkflowInputs): Promise<WorkflowOutputs> {
  return callNode<WorkflowOutputs>("nodetool.workflows.workflow_node.Workflow", inputs);
}

workflow.stream = function (inputs: WorkflowInputs): AsyncIterable<Partial<WorkflowOutputs>> {
  return streamNode<Partial<WorkflowOutputs>>("nodetool.workflows.workflow_node.Workflow", inputs);
};

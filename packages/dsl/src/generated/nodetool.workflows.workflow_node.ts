// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Workflow — nodetool.workflows.workflow_node.Workflow
export type WorkflowInputs = {
  workflow_id?: Connectable<string>;
  workflow_json?: Connectable<Record<string, unknown>>;
  [name: string]: unknown;
};

export interface WorkflowOutputs {
}

export function workflow(inputs: WorkflowInputs, options?: NodeOptions): NodeWithOutputs<WorkflowOutputs> {
  return createNode("nodetool.workflows.workflow_node.Workflow", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"single","source":"__execution__"}} });
}

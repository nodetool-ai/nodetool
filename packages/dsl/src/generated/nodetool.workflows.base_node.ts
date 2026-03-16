// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Preview — nodetool.workflows.base_node.Preview
export interface PreviewInputs {
  value?: Connectable<unknown>;
  name?: Connectable<string>;
}

export function preview(inputs: PreviewInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.workflows.base_node.Preview", inputs as Record<string, unknown>);
}

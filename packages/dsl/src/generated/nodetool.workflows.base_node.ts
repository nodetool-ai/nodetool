// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Preview — nodetool.workflows.base_node.Preview
export interface PreviewInputs {
  value?: Connectable<unknown>;
  name?: Connectable<string>;
}

export interface PreviewOutputs {
}

export function preview(inputs: PreviewInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PreviewOutputs> {
  return createNode("nodetool.workflows.base_node.Preview", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

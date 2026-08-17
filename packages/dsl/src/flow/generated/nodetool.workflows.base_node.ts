// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Preview — nodetool.workflows.base_node.Preview
export type PreviewInputs = {
  value?: unknown;
  name?: string;
};

export interface PreviewOutputs {
}

export function preview(inputs: PreviewInputs): Promise<PreviewOutputs> {
  return callNode<PreviewOutputs>("nodetool.workflows.base_node.Preview", inputs);
}

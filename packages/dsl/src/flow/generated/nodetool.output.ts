// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Output — nodetool.output.Output
export type OutputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface OutputOutputs {
  output: unknown;
}

export function output(inputs: OutputInputs): Promise<OutputOutputs> {
  return callNode<OutputOutputs>("nodetool.output.Output", inputs);
}

output.stream = function (inputs: OutputInputs): AsyncIterable<Partial<OutputOutputs>> {
  return streamNode<Partial<OutputOutputs>>("nodetool.output.Output", inputs);
};

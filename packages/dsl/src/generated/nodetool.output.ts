// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Output — nodetool.output.Output
export type OutputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface OutputOutputs {
  output: unknown;
}

export function output(inputs: OutputInputs, options?: NodeOptions): NodeWithOutputs<OutputOutputs, "output"> {
  return createNode("nodetool.output.Output", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"forward","source":"value"}} });
}

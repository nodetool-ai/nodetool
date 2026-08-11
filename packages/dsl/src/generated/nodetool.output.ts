// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Output — nodetool.output.Output
export type OutputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface OutputOutputs {
  output: unknown;
}

export function output(inputs: OutputInputs): DslNode<OutputOutputs, "output"> {
  return createNode("nodetool.output.Output", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

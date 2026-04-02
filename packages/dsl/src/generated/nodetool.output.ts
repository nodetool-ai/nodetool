// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Output — nodetool.output.Output
export interface OutputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface OutputOutputs {
  output: unknown;
}

export function output(inputs: OutputInputs): DslNode<OutputOutputs, "output"> {
  return createNode(
    "nodetool.output.Output",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output", streaming: true }
  );
}

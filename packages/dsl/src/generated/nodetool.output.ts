// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Output — nodetool.output.Output
export interface OutputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function output(inputs: OutputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.output.Output", inputs as Record<string, unknown>, { streaming: true });
}

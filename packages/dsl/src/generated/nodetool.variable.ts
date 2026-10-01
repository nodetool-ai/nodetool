// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Set Variable — nodetool.variable.SetVariable
export type SetVariableInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
};

export interface SetVariableOutputs {
  output: unknown;
}

export function setVariable(inputs: SetVariableInputs, options?: NodeOptions): NodeWithOutputs<SetVariableOutputs, "output"> {
  return createNode("nodetool.variable.SetVariable", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output" });
}

// Get Variable — nodetool.variable.GetVariable
export type GetVariableInputs = {
  name?: Connectable<string>;
  trigger?: Connectable<unknown>;
};

export interface GetVariableOutputs {
  output: unknown;
}

export function getVariable(inputs: GetVariableInputs, options?: NodeOptions): NodeWithOutputs<GetVariableOutputs, "output"> {
  return createNode("nodetool.variable.GetVariable", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, outputCorrelation: {"output":{"kind":"iteration","source":"__execution__","group":"channel"}} });
}

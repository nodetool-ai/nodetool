// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Set Variable — nodetool.variable.SetVariable
export type SetVariableInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
};

export interface SetVariableOutputs {
  output: unknown;
}

export function setVariable(inputs: SetVariableInputs): DslNode<SetVariableOutputs, "output"> {
  return createNode("nodetool.variable.SetVariable", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Variable — nodetool.variable.GetVariable
export type GetVariableInputs = {
  name?: Connectable<string>;
  trigger?: Connectable<unknown>;
};

export interface GetVariableOutputs {
  output: unknown;
}

export function getVariable(inputs: GetVariableInputs): DslNode<GetVariableOutputs, "output"> {
  return createNode("nodetool.variable.GetVariable", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

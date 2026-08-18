// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Set Variable — nodetool.variable.SetVariable
export type SetVariableInputs = {
  name?: string;
  value?: unknown;
};

export interface SetVariableOutputs {
  output: unknown;
}

export function setVariable(inputs: SetVariableInputs): Promise<SetVariableOutputs> {
  return callNode<SetVariableOutputs>("nodetool.variable.SetVariable", inputs);
}

// Get Variable — nodetool.variable.GetVariable
export type GetVariableInputs = {
  name?: string;
  trigger?: unknown;
};

export interface GetVariableOutputs {
  output: unknown;
}

export function getVariable(inputs: GetVariableInputs): Promise<GetVariableOutputs> {
  return callNode<GetVariableOutputs>("nodetool.variable.GetVariable", inputs);
}

getVariable.stream = function (inputs: GetVariableInputs): AsyncIterable<Partial<GetVariableOutputs>> {
  return streamNode<Partial<GetVariableOutputs>>("nodetool.variable.GetVariable", inputs);
};

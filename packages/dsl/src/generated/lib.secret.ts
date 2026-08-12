// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Get Secret — lib.secret.GetSecret
export type GetSecretInputs = {
  name?: Connectable<string>;
  default?: Connectable<string>;
};

export interface GetSecretOutputs {
  output: string;
}

export function getSecret(inputs: GetSecretInputs): DslNode<GetSecretOutputs, "output"> {
  return createNode("lib.secret.GetSecret", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

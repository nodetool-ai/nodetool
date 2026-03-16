// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Get Secret — lib.secret.GetSecret
export interface GetSecretInputs {
  name?: Connectable<string>;
  default?: Connectable<string>;
}

export function getSecret(inputs: GetSecretInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.secret.GetSecret", inputs as Record<string, unknown>);
}

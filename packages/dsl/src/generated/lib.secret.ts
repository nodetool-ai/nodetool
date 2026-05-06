// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Get Secret — lib.secret.GetSecret
export interface GetSecretInputs {
  name?: Connectable<string>;
  default?: Connectable<string>;
}

export interface GetSecretOutputs {
  output: string;
}

export function getSecret(inputs: GetSecretInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetSecretOutputs, "output"> {
  return createNode("lib.secret.GetSecret", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

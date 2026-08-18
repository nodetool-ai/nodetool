// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Get Secret — lib.secret.GetSecret
export type GetSecretInputs = {
  name?: string;
  default?: string;
};

export interface GetSecretOutputs {
  output: string;
}

export function getSecret(inputs: GetSecretInputs): Promise<GetSecretOutputs> {
  return callNode<GetSecretOutputs>("lib.secret.GetSecret", inputs);
}

// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Get Database Path — lib.sqlite.GetDatabasePath
export type GetDatabasePathInputs = {
  database_name?: string;
};

export interface GetDatabasePathOutputs {
  output: string;
}

export function getDatabasePath(inputs: GetDatabasePathInputs): Promise<GetDatabasePathOutputs> {
  return callNode<GetDatabasePathOutputs>("lib.sqlite.GetDatabasePath", inputs);
}

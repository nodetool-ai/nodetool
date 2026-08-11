// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Get Database Path — lib.sqlite.GetDatabasePath
export interface GetDatabasePathInputs {
  database_name?: Connectable<string>;
}

export interface GetDatabasePathOutputs {
  output: string;
}

export function getDatabasePath(inputs: GetDatabasePathInputs): DslNode<GetDatabasePathOutputs, "output"> {
  return createNode("lib.sqlite.GetDatabasePath", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Get Database Path — lib.sqlite.GetDatabasePath
export type GetDatabasePathInputs = {
  database_name?: Connectable<string>;
};

export interface GetDatabasePathOutputs {
  output: string;
}

export function getDatabasePath(inputs: GetDatabasePathInputs): DslNode<GetDatabasePathOutputs, "output"> {
  return createNode("lib.sqlite.GetDatabasePath", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Get Database Path — lib.sqlite.GetDatabasePath
export type GetDatabasePathInputs = {
  database_name?: Connectable<string>;
};

export interface GetDatabasePathOutputs {
  output: string;
}

export function getDatabasePath(inputs: GetDatabasePathInputs, options?: NodeOptions): NodeWithOutputs<GetDatabasePathOutputs, "output"> {
  return createNode("lib.sqlite.GetDatabasePath", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

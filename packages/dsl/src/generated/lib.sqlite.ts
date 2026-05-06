// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Create Table — lib.sqlite.CreateTable
export interface CreateTableInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  columns?: Connectable<unknown>;
  add_primary_key?: Connectable<boolean>;
  if_not_exists?: Connectable<boolean>;
}

export interface CreateTableOutputs {
  database_name: string;
  table_name: string;
  columns: unknown;
}

export function createTable(inputs: CreateTableInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CreateTableOutputs> {
  return createNode("lib.sqlite.CreateTable", inputs as Record<string, unknown>, { outputNames: ["database_name", "table_name", "columns"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Insert — lib.sqlite.Insert
export interface InsertInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export interface InsertOutputs {
  output: Record<string, unknown>;
}

export function insert(inputs: InsertInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<InsertOutputs, "output"> {
  return createNode("lib.sqlite.Insert", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Query — lib.sqlite.Query
export interface QueryInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  where?: Connectable<string>;
  columns?: Connectable<unknown>;
  order_by?: Connectable<string>;
  limit?: Connectable<number>;
}

export interface QueryOutputs {
  output: Record<string, unknown>[];
}

export function query(inputs: QueryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<QueryOutputs, "output"> {
  return createNode("lib.sqlite.Query", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Update — lib.sqlite.Update
export interface UpdateInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
  where?: Connectable<string>;
}

export interface UpdateOutputs {
  output: Record<string, unknown>;
}

export function update(inputs: UpdateInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<UpdateOutputs, "output"> {
  return createNode("lib.sqlite.Update", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Delete — lib.sqlite.Delete
export interface DeleteInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  where?: Connectable<string>;
}

export interface DeleteOutputs {
  output: Record<string, unknown>;
}

export function delete_(inputs: DeleteInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DeleteOutputs, "output"> {
  return createNode("lib.sqlite.Delete", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Execute SQL — lib.sqlite.ExecuteSQL
export interface ExecuteSQLInputs {
  database_name?: Connectable<string>;
  sql?: Connectable<string>;
  parameters?: Connectable<unknown[]>;
}

export interface ExecuteSQLOutputs {
  output: Record<string, unknown>;
}

export function executeSQL(inputs: ExecuteSQLInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecuteSQLOutputs, "output"> {
  return createNode("lib.sqlite.ExecuteSQL", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Database Path — lib.sqlite.GetDatabasePath
export interface GetDatabasePathInputs {
  database_name?: Connectable<string>;
}

export interface GetDatabasePathOutputs {
  output: string;
}

export function getDatabasePath(inputs: GetDatabasePathInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetDatabasePathOutputs, "output"> {
  return createNode("lib.sqlite.GetDatabasePath", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

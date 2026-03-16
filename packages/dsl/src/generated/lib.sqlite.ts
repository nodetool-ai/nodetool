// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Create Table — lib.sqlite.CreateTable
export interface CreateTableInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  columns?: Connectable<unknown>;
  add_primary_key?: Connectable<boolean>;
  if_not_exists?: Connectable<boolean>;
}

export interface CreateTableOutputs {
  database_name: OutputHandle<string>;
  table_name: OutputHandle<string>;
  columns: OutputHandle<unknown>;
}

export function createTable(inputs: CreateTableInputs): DslNode<CreateTableOutputs> {
  return createNode("lib.sqlite.CreateTable", inputs as Record<string, unknown>, { multiOutput: true });
}

// Insert — lib.sqlite.Insert
export interface InsertInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
}

export function insert(inputs: InsertInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.sqlite.Insert", inputs as Record<string, unknown>);
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

export function query(inputs: QueryInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.sqlite.Query", inputs as Record<string, unknown>);
}

// Update — lib.sqlite.Update
export interface UpdateInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  data?: Connectable<Record<string, unknown>>;
  where?: Connectable<string>;
}

export function update(inputs: UpdateInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.sqlite.Update", inputs as Record<string, unknown>);
}

// Delete — lib.sqlite.Delete
export interface DeleteInputs {
  database_name?: Connectable<string>;
  table_name?: Connectable<string>;
  where?: Connectable<string>;
}

export function delete_(inputs: DeleteInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.sqlite.Delete", inputs as Record<string, unknown>);
}

// Execute SQL — lib.sqlite.ExecuteSQL
export interface ExecuteSQLInputs {
  database_name?: Connectable<string>;
  sql?: Connectable<string>;
  parameters?: Connectable<unknown[]>;
}

export function executeSQL(inputs: ExecuteSQLInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.sqlite.ExecuteSQL", inputs as Record<string, unknown>);
}

// Get Database Path — lib.sqlite.GetDatabasePath
export interface GetDatabasePathInputs {
  database_name?: Connectable<string>;
}

export function getDatabasePath(inputs: GetDatabasePathInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.sqlite.GetDatabasePath", inputs as Record<string, unknown>);
}

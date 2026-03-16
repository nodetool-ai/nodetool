// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Select — lib.supabase.Select
export interface SelectInputs {
  table_name?: Connectable<string>;
  columns?: Connectable<unknown>;
  filters?: Connectable<unknown[]>;
  order_by?: Connectable<string>;
  descending?: Connectable<boolean>;
  limit?: Connectable<number>;
  to_dataframe?: Connectable<boolean>;
}

export function select(inputs: SelectInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.supabase.Select", inputs as Record<string, unknown>);
}

// Insert — lib.supabase.Insert
export interface InsertInputs {
  table_name?: Connectable<string>;
  records?: Connectable<Record<string, unknown>[] | Record<string, unknown>>;
  return_rows?: Connectable<boolean>;
}

export function insert(inputs: InsertInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.supabase.Insert", inputs as Record<string, unknown>);
}

// Update — lib.supabase.Update
export interface UpdateInputs {
  table_name?: Connectable<string>;
  values?: Connectable<Record<string, unknown>>;
  filters?: Connectable<unknown[]>;
  return_rows?: Connectable<boolean>;
}

export function update(inputs: UpdateInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.supabase.Update", inputs as Record<string, unknown>);
}

// Delete — lib.supabase.Delete
export interface DeleteInputs {
  table_name?: Connectable<string>;
  filters?: Connectable<unknown[]>;
}

export function delete_(inputs: DeleteInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.supabase.Delete", inputs as Record<string, unknown>);
}

// Upsert — lib.supabase.Upsert
export interface UpsertInputs {
  table_name?: Connectable<string>;
  records?: Connectable<Record<string, unknown>[] | Record<string, unknown>>;
  return_rows?: Connectable<boolean>;
}

export function upsert(inputs: UpsertInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.supabase.Upsert", inputs as Record<string, unknown>);
}

// RPC — lib.supabase.RPC
export interface RPCInputs {
  function?: Connectable<string>;
  params?: Connectable<Record<string, unknown>>;
  to_dataframe?: Connectable<boolean>;
}

export function rPC(inputs: RPCInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.supabase.RPC", inputs as Record<string, unknown>);
}

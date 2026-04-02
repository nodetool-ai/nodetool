// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

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

export interface SelectOutputs {
  output: unknown;
}

export function select(inputs: SelectInputs): DslNode<SelectOutputs, "output"> {
  return createNode("lib.supabase.Select", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Insert — lib.supabase.Insert
export interface InsertInputs {
  table_name?: Connectable<string>;
  records?: Connectable<Record<string, unknown>[] | Record<string, unknown>>;
  return_rows?: Connectable<boolean>;
}

export interface InsertOutputs {
  output: unknown;
}

export function insert(inputs: InsertInputs): DslNode<InsertOutputs, "output"> {
  return createNode("lib.supabase.Insert", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Update — lib.supabase.Update
export interface UpdateInputs {
  table_name?: Connectable<string>;
  values?: Connectable<Record<string, unknown>>;
  filters?: Connectable<unknown[]>;
  return_rows?: Connectable<boolean>;
}

export interface UpdateOutputs {
  output: unknown;
}

export function update(inputs: UpdateInputs): DslNode<UpdateOutputs, "output"> {
  return createNode("lib.supabase.Update", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Delete — lib.supabase.Delete
export interface DeleteInputs {
  table_name?: Connectable<string>;
  filters?: Connectable<unknown[]>;
}

export interface DeleteOutputs {
  output: Record<string, unknown>;
}

export function delete_(
  inputs: DeleteInputs
): DslNode<DeleteOutputs, "output"> {
  return createNode("lib.supabase.Delete", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Upsert — lib.supabase.Upsert
export interface UpsertInputs {
  table_name?: Connectable<string>;
  records?: Connectable<Record<string, unknown>[] | Record<string, unknown>>;
  return_rows?: Connectable<boolean>;
}

export interface UpsertOutputs {
  output: unknown;
}

export function upsert(inputs: UpsertInputs): DslNode<UpsertOutputs, "output"> {
  return createNode("lib.supabase.Upsert", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// RPC — lib.supabase.RPC
export interface RPCInputs {
  function?: Connectable<string>;
  params?: Connectable<Record<string, unknown>>;
  to_dataframe?: Connectable<boolean>;
}

export interface RPCOutputs {
  output: unknown;
}

export function rpc(inputs: RPCInputs): DslNode<RPCOutputs, "output"> {
  return createNode("lib.supabase.RPC", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

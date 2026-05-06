// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// GraphQL Query — lib.graphql.Query
export interface QueryInputs {
  url?: Connectable<string>;
  query?: Connectable<string>;
  variables?: Connectable<string>;
  headers?: Connectable<string>;
  operation_name?: Connectable<string>;
}

export interface QueryOutputs {
  data: unknown;
  errors: unknown[];
  status: number;
}

export function query(inputs: QueryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<QueryOutputs> {
  return createNode("lib.graphql.Query", inputs as Record<string, unknown>, { outputNames: ["data", "errors", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// GraphQL Query with Auth — lib.graphql.QueryWithAuth
export interface QueryWithAuthInputs {
  url?: Connectable<string>;
  query?: Connectable<string>;
  variables?: Connectable<string>;
  headers?: Connectable<string>;
  operation_name?: Connectable<string>;
  auth_token?: Connectable<string>;
}

export interface QueryWithAuthOutputs {
  data: unknown;
  errors: unknown[];
  status: number;
}

export function queryWithAuth(inputs: QueryWithAuthInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<QueryWithAuthOutputs> {
  return createNode("lib.graphql.QueryWithAuth", inputs as Record<string, unknown>, { outputNames: ["data", "errors", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// GraphQL Introspection — lib.graphql.Introspection
export interface IntrospectionInputs {
  url?: Connectable<string>;
  headers?: Connectable<string>;
}

export interface IntrospectionOutputs {
  output: Record<string, unknown>;
}

export function introspection(inputs: IntrospectionInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IntrospectionOutputs, "output"> {
  return createNode("lib.graphql.Introspection", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// GraphQL Batch Query — lib.graphql.BatchQuery
export interface BatchQueryInputs {
  url?: Connectable<string>;
  queries_json?: Connectable<string>;
  headers?: Connectable<string>;
}

export interface BatchQueryOutputs {
  output: unknown[];
  status: number;
}

export function batchQuery(inputs: BatchQueryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BatchQueryOutputs> {
  return createNode("lib.graphql.BatchQuery", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

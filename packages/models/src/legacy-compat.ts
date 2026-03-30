/**
 * Legacy type compatibility shims.
 *
 * These types are exported for consumers that still reference them.
 * They will be removed after the transition period.
 */

import type { DBModel } from "./base-model.js";
import type { DatabaseAdapter } from "./database-adapter.js";
import type { TableSchema } from "./database-adapter.js";

export interface IndexSpec {
  name: string;
  columns: string[];
  unique: boolean;
}

export type AdapterResolver = (schema: TableSchema) => DatabaseAdapter;

 
export type ModelClass<T extends DBModel = DBModel> = {
  new (data: Record<string, unknown>): T;
  name: string;
  table: unknown;
  primaryKey: string;
  create(data: Record<string, unknown>): Promise<T>;
  get(key: string | number): Promise<T | null>;
};

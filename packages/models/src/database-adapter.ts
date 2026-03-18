/**
 * Database Adapter – abstract interface for persistence backends.
 *
 * Port of Python's `nodetool.models.database_adapter`.
 */

import type { ConditionBuilder } from "./condition-builder.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface TableSchema {
  table_name: string;
  primary_key?: string; // defaults to "id"
   
  columns: Record<string, FieldDef>;
}

export interface FieldDef {
  type: "string" | "number" | "boolean" | "json" | "datetime";
  optional?: boolean;
  default_value?: unknown;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * Abstract interface every database backend must implement.
 */
export interface DatabaseAdapter {
  readonly tableName: string;
  readonly tableSchema: TableSchema;

  /** Create the table (no-op if it already exists). */
  createTable(): Promise<void>;

  /** Drop the table. */
  dropTable(): Promise<void>;

  /** Insert or replace a row. */
  save(item: Row): Promise<void>;

  /** Retrieve a single row by primary key. */
  get(key: string | number): Promise<Row | null>;

  /** Delete a row by primary key. */
  delete(primaryKey: string | number): Promise<void>;

  /**
   * Query rows with optional filtering, ordering and pagination.
   *
   * @returns A tuple of [rows, cursor]. Cursor is "" when there are no more results.
   */
  query(opts?: {
    condition?: ConditionBuilder;
    orderBy?: string;
    limit?: number;
    reverse?: boolean;
    columns?: string[];
  }): Promise<[Row[], string]>;

  /** Create an index. */
  createIndex(
    indexName: string,
    columns: string[],
    unique?: boolean,
  ): Promise<void>;

  /** Drop an index. */
  dropIndex(indexName: string): Promise<void>;

  /** List all indexes on the table. */
  listIndexes(): Promise<IndexDef[]>;

  /** Get the primary key column name. */
  getPrimaryKey(): string;
}

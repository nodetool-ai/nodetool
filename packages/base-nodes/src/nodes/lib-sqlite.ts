import Database from "better-sqlite3";
import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { join } from "node:path";
import { existsSync } from "node:fs";

function quoteIdentifier(name: string): string {
  const escaped = name.replace(/"/g, '""');
  return `"${escaped}"`;
}

function columnTypeToSqlite(columnType: string): string {
  const mapping: Record<string, string> = {
    int: "INTEGER",
    float: "REAL",
    datetime: "TEXT",
    string: "TEXT",
    object: "TEXT",
  };
  return mapping[columnType] ?? "TEXT";
}

function resolveDbPath(context: ProcessingContext | undefined, databaseName: string): string {
  const workspaceDir = context?.workspaceDir;
  if (!workspaceDir) {
    throw new Error("workspace_dir is required for SQLite operations");
  }
  return join(workspaceDir, databaseName);
}

function serializeValue(v: unknown): unknown {
  if (v !== null && typeof v === "object") {
    return JSON.stringify(v);
  }
  return v;
}

function tryParseJsonValues(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string") {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class CreateTableLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.CreateTable";
            static readonly title = "Create Table";
            static readonly description = "Create a new SQLite table with specified columns.\n    sqlite, database, table, create, schema\n\n    Use cases:\n    - Initialize database schema for flashcards\n    - Set up tables for persistent storage\n    - Create memory structures for agents";
        static readonly metadataOutputTypes = {
    database_name: "str",
    table_name: "str",
    columns: "record_type"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;

  @prop({ type: "str", default: "flashcards", title: "Table Name", description: "Name of the table to create" })
  declare table_name: any;

  @prop({ type: "record_type", default: {
  "type": "record_type",
  "columns": []
}, title: "Columns", description: "Column definitions" })
  declare columns: any;

  @prop({ type: "bool", default: true, title: "Add Primary Key", description: "Automatically make first integer column PRIMARY KEY AUTOINCREMENT" })
  declare add_primary_key: any;

  @prop({ type: "bool", default: true, title: "If Not Exists", description: "Only create table if it doesn't exist" })
  declare if_not_exists: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const tableName = String(inputs.table_name ?? this.table_name ?? "flashcards");
    const columnsInput = (inputs.columns ?? this.columns ?? { columns: [] }) as {
      columns?: Array<{ name: string; data_type: string }>;
    };
    const columns = columnsInput.columns ?? [];
    const addPrimaryKey = inputs.add_primary_key ?? this.add_primary_key ?? true;
    const ifNotExists = inputs.if_not_exists ?? this.if_not_exists ?? true;

    const dbPath = resolveDbPath(context, databaseName);
    const db = new Database(dbPath);

    try {
      const existing = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName) as Record<string, unknown> | undefined;

      if (existing) {
        return { database_name: databaseName, table_name: tableName, columns: columnsInput };
      }

      const columnDefs: string[] = [];
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const sqliteType = columnTypeToSqlite(col.data_type);
        const colName = quoteIdentifier(col.name);

        if (i === 0 && addPrimaryKey && col.data_type === "int") {
          columnDefs.push(`${colName} INTEGER PRIMARY KEY AUTOINCREMENT`);
        } else {
          columnDefs.push(`${colName} ${sqliteType}`);
        }
      }

      const columnsSql = columnDefs.join(", ");
      const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";
      const quotedTableName = quoteIdentifier(tableName);
      const sql = `CREATE TABLE ${ifNotExistsClause}${quotedTableName} (${columnsSql})`;

      db.exec(sql);

      return { database_name: databaseName, table_name: tableName, columns: columnsInput };
    } finally {
      db.close();
    }
  }
}

export class InsertLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.Insert";
            static readonly title = "Insert";
            static readonly description = "Insert a record into a SQLite table.\n    sqlite, database, insert, add, record\n\n    Use cases:\n    - Add new flashcards to database\n    - Store agent observations\n    - Persist workflow results";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;

  @prop({ type: "str", default: "flashcards", title: "Table Name", description: "Name of the table to insert into" })
  declare table_name: any;

  @prop({ type: "dict[str, any]", default: {
  "content": "example"
}, title: "Data", description: "Data to insert as dict (column: value)" })
  declare data: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const tableName = String(inputs.table_name ?? this.table_name ?? "flashcards");
    const data = (inputs.data ?? this.data ?? {}) as Record<string, unknown>;

    const dbPath = resolveDbPath(context, databaseName);
    const db = new Database(dbPath);

    try {
      const keys = Object.keys(data);
      const columnsPart = keys.map((k) => quoteIdentifier(k)).join(", ");
      const placeholders = keys.map(() => "?").join(", ");
      const quotedTableName = quoteIdentifier(tableName);
      const sql = `INSERT INTO ${quotedTableName} (${columnsPart}) VALUES (${placeholders})`;

      const values = Object.values(data).map(serializeValue);
      const result = db.prepare(sql).run(...values);

      return {
        row_id: result.lastInsertRowid,
        rows_affected: result.changes,
        message: `Inserted record with ID ${result.lastInsertRowid}`,
      };
    } finally {
      db.close();
    }
  }
}

export class QueryLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.Query";
            static readonly title = "Query";
            static readonly description = "Query records from a SQLite table.\n    sqlite, database, query, select, search, retrieve\n\n    Use cases:\n    - Retrieve flashcards for review\n    - Search agent memory\n    - Fetch stored data";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;

  @prop({ type: "str", default: "flashcards", title: "Table Name", description: "Name of the table to query" })
  declare table_name: any;

  @prop({ type: "str", default: "", title: "Where", description: "WHERE clause (without 'WHERE' keyword), e.g., 'id = 1'" })
  declare where: any;

  @prop({ type: "record_type", default: {
  "type": "record_type",
  "columns": []
}, title: "Columns", description: "Columns to select" })
  declare columns: any;

  @prop({ type: "str", default: "", title: "Order By", description: "ORDER BY clause (without 'ORDER BY' keyword)" })
  declare order_by: any;

  @prop({ type: "int", default: 0, title: "Limit", description: "Maximum number of rows to return (0 = no limit)" })
  declare limit: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const tableName = String(inputs.table_name ?? this.table_name ?? "flashcards");
    const where = String(inputs.where ?? this.where ?? "");
    const columnsInput = (inputs.columns ?? this.columns ?? { columns: [] }) as {
      columns?: Array<{ name: string }>;
    };
    const cols = columnsInput.columns ?? [];
    const orderBy = String(inputs.order_by ?? this.order_by ?? "");
    const limit = Number(inputs.limit ?? this.limit ?? 0);

    const dbPath = resolveDbPath(context, databaseName);

    if (!existsSync(dbPath)) {
      return { output: [] };
    }

    const db = new Database(dbPath);

    try {
      const selectColumns =
        cols.length === 0 ? "*" : cols.map((c) => quoteIdentifier(c.name)).join(", ");

      const quotedTableName = quoteIdentifier(tableName);
      let sql = `SELECT ${selectColumns} FROM ${quotedTableName}`;

      if (where) {
        sql += ` WHERE ${where}`;
      }
      if (orderBy) {
        sql += ` ORDER BY ${orderBy}`;
      }
      if (limit > 0) {
        sql += ` LIMIT ${limit}`;
      }

      const rows = db.prepare(sql).all() as Record<string, unknown>[];
      const results = rows.map(tryParseJsonValues);

      return { output: results };
    } finally {
      db.close();
    }
  }
}

export class UpdateLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.Update";
            static readonly title = "Update";
            static readonly description = "Update records in a SQLite table.\n    sqlite, database, update, modify, change\n\n    Use cases:\n    - Update flashcard content\n    - Modify stored records\n    - Change agent memory";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;

  @prop({ type: "str", default: "flashcards", title: "Table Name", description: "Name of the table to update" })
  declare table_name: any;

  @prop({ type: "dict[str, any]", default: {
  "content": "updated"
}, title: "Data", description: "Data to update as dict (column: new_value)" })
  declare data: any;

  @prop({ type: "str", default: "", title: "Where", description: "WHERE clause (without 'WHERE' keyword), e.g., 'id = 1'" })
  declare where: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const tableName = String(inputs.table_name ?? this.table_name ?? "flashcards");
    const data = (inputs.data ?? this.data ?? {}) as Record<string, unknown>;
    const where = String(inputs.where ?? this.where ?? "");

    const dbPath = resolveDbPath(context, databaseName);
    const db = new Database(dbPath);

    try {
      const keys = Object.keys(data);
      const setClause = keys.map((col) => `${quoteIdentifier(col)} = ?`).join(", ");
      const quotedTableName = quoteIdentifier(tableName);
      let sql = `UPDATE ${quotedTableName} SET ${setClause}`;

      if (where) {
        sql += ` WHERE ${where}`;
      }

      const values = Object.values(data).map(serializeValue);
      const result = db.prepare(sql).run(...values);

      return {
        rows_affected: result.changes,
        message: `Updated ${result.changes} record(s)`,
      };
    } finally {
      db.close();
    }
  }
}

export class DeleteLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.Delete";
            static readonly title = "Delete";
            static readonly description = "Delete records from a SQLite table.\n    sqlite, database, delete, remove, drop\n\n    Use cases:\n    - Remove flashcards\n    - Delete agent memory\n    - Clean up old data";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;

  @prop({ type: "str", default: "flashcards", title: "Table Name", description: "Name of the table to delete from" })
  declare table_name: any;

  @prop({ type: "str", default: "", title: "Where", description: "WHERE clause (without 'WHERE' keyword), e.g., 'id = 1'. REQUIRED for safety." })
  declare where: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const tableName = String(inputs.table_name ?? this.table_name ?? "flashcards");
    const where = String(inputs.where ?? this.where ?? "");

    if (!where) {
      throw new Error("WHERE clause is required for DELETE operations to prevent accidental data loss");
    }

    const dbPath = resolveDbPath(context, databaseName);
    const db = new Database(dbPath);

    try {
      const quotedTableName = quoteIdentifier(tableName);
      const sql = `DELETE FROM ${quotedTableName} WHERE ${where}`;

      const result = db.prepare(sql).run();

      return {
        rows_affected: result.changes,
        message: `Deleted ${result.changes} record(s)`,
      };
    } finally {
      db.close();
    }
  }
}

export class ExecuteSQLLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.ExecuteSQL";
            static readonly title = "Execute SQL";
            static readonly description = "Execute arbitrary SQL statements for advanced operations.\n    sqlite, database, sql, execute, custom\n\n    Use cases:\n    - Complex queries with joins\n    - Aggregate functions (COUNT, SUM, AVG)\n    - Custom SQL operations";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;

  @prop({ type: "str", default: "SELECT * FROM flashcards", title: "Sql", description: "SQL statement to execute" })
  declare sql: any;

  @prop({ type: "list[any]", default: [], title: "Parameters", description: "Parameters for parameterized queries (use ? in SQL)" })
  declare parameters: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const sqlStr = String(inputs.sql ?? this.sql ?? "");
    const parameters = (inputs.parameters ?? this.parameters ?? []) as unknown[];

    const dbPath = resolveDbPath(context, databaseName);
    const db = new Database(dbPath);

    try {
      const trimmed = sqlStr.trim().toUpperCase();
      const isModifying = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(trimmed);

      if (isModifying) {
        const result = db.prepare(sqlStr).run(...parameters);
        return {
          rows_affected: result.changes,
          last_row_id: result.lastInsertRowid,
          message: "SQL executed successfully",
        };
      } else {
        const rows = db.prepare(sqlStr).all(...parameters) as Record<string, unknown>[];
        const results = rows.map(tryParseJsonValues);
        return {
          rows: results,
          count: results.length,
          message: `Query returned ${results.length} row(s)`,
        };
      }
    } finally {
      db.close();
    }
  }
}

export class GetDatabasePathLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.GetDatabasePath";
            static readonly title = "Get Database Path";
            static readonly description = "Get the full path to a SQLite database file.\n    sqlite, database, path, location\n\n    Use cases:\n    - Reference database location\n    - Verify database exists\n    - Pass path to external tools";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "memory.db", title: "Database Name", description: "Name of the SQLite database file" })
  declare database_name: any;




  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    const databaseName = String(inputs.database_name ?? this.database_name ?? "memory.db");
    const dbPath = resolveDbPath(context, databaseName);
    return { output: dbPath };
  }
}

export const LIB_SQLITE_NODES: readonly NodeClass[] = [
  CreateTableLibNode as unknown as NodeClass,
  InsertLibNode as unknown as NodeClass,
  QueryLibNode as unknown as NodeClass,
  UpdateLibNode as unknown as NodeClass,
  DeleteLibNode as unknown as NodeClass,
  ExecuteSQLLibNode as unknown as NodeClass,
  GetDatabasePathLibNode as unknown as NodeClass,
];

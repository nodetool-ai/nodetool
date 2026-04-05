/**
 * SQLite DatabaseAdapter implementation using better-sqlite3.
 *
 * Port of Python's `nodetool.models.sqlite_adapter.SQLiteAdapter`.
 * Uses synchronous better-sqlite3 driver; all methods wrap returns
 * in Promise.resolve() to satisfy the async DatabaseAdapter interface.
 */

import Database from "better-sqlite3";
import {
  Condition,
  ConditionBuilder,
  ConditionGroup,
  LogicalOperator,
  Operator,
  Variable
} from "./condition-builder.js";
import type {
  DatabaseAdapter,
  IndexDef,
  Row,
  TableSchema
} from "./database-adapter.js";

// ── Helpers ───────────────────────────────────────────────────────────

const VALID_COLUMN_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateColumnName(name: string): string {
  if (name === "*") return name;
  if (!VALID_COLUMN_NAME_RE.test(name)) {
    throw new Error(`Invalid column name: ${name}`);
  }
  return name;
}

function quoteIdentifier(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/** Map FieldDef type to SQLite column type. */
function sqliteType(fieldType: string): string {
  switch (fieldType) {
    case "string":
      return "TEXT";
    case "number":
      return "REAL";
    case "boolean":
      return "INTEGER";
    case "json":
      return "TEXT";
    case "datetime":
      return "TEXT";
    default:
      return "TEXT";
  }
}

/** Serialize a value for SQLite storage based on its field definition type. */
function serializeValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case "boolean":
      return value ? 1 : 0;
    case "json":
      return JSON.stringify(value);
    case "string":
    case "datetime":
      return value;
    case "number":
      return value;
    default:
      return value;
  }
}

/** Deserialize a value from SQLite storage based on its field definition type. */
function deserializeValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case "boolean":
      return Boolean(value);
    case "json":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "string":
    case "datetime":
      return value;
    default:
      return value;
  }
}

/** Serialize an entire row for storage. */
function serializeRow(row: Row, schema: TableSchema): Row {
  const result: Row = {};
  for (const [col, fieldDef] of Object.entries(schema.columns)) {
    if (col in row) {
      result[col] = serializeValue(row[col], fieldDef.type);
    }
  }
  return result;
}

/** Deserialize an entire row from storage. */
function deserializeRow(row: Row, schema: TableSchema): Row {
  const result: Row = {};
  for (const key of Object.keys(row)) {
    const fieldDef = schema.columns[key];
    if (fieldDef) {
      result[key] = deserializeValue(row[key], fieldDef.type);
    } else {
      result[key] = row[key];
    }
  }
  return result;
}

// ── SQLiteAdapter ─────────────────────────────────────────────────────

export class SQLiteAdapter implements DatabaseAdapter {
  readonly tableName: string;
  readonly tableSchema: TableSchema;
  private db: Database.Database;

  constructor(db: Database.Database, schema: TableSchema) {
    this.db = db;
    this.tableSchema = schema;
    this.tableName = schema.table_name;
  }

  getPrimaryKey(): string {
    return this.tableSchema.primary_key ?? "id";
  }

  async createTable(): Promise<void> {
    const pk = this.getPrimaryKey();
    const columnDefs: string[] = [];
    for (const [colName, fieldDef] of Object.entries(
      this.tableSchema.columns
    )) {
      validateColumnName(colName);
      const colType = sqliteType(fieldDef.type);
      columnDefs.push(`${quoteIdentifier(colName)} ${colType}`);
    }
    const sql =
      `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(this.tableName)} (` +
      columnDefs.join(", ") +
      `, PRIMARY KEY (${quoteIdentifier(pk)}))`;
    this.db.exec(sql);

    // Migrate: add any columns defined in the schema but missing from the table
    const existingCols = new Set(
      (
        this.db.pragma(
          `table_info(${quoteIdentifier(this.tableName)})`
        ) as Array<{ name: string }>
      ).map((row) => row.name)
    );
    for (const [colName, fieldDef] of Object.entries(
      this.tableSchema.columns
    )) {
      if (!existingCols.has(colName)) {
        const colType = sqliteType(fieldDef.type);
        this.db.exec(
          `ALTER TABLE ${quoteIdentifier(this.tableName)} ADD COLUMN ${quoteIdentifier(colName)} ${colType}`
        );
      }
    }
  }

  async dropTable(): Promise<void> {
    this.db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(this.tableName)}`);
  }

  async save(item: Row): Promise<void> {
    const pk = this.getPrimaryKey();
    const key = item[pk];
    if (key === undefined || key === null) {
      throw new Error(`Missing primary key "${pk}" in save payload`);
    }

    const serialized = serializeRow(item, this.tableSchema);
    const cols = Object.keys(serialized);
    const colsSql = cols.map((c) => quoteIdentifier(c)).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((c) => serialized[c]);

    const sql = `INSERT OR REPLACE INTO ${quoteIdentifier(this.tableName)} (${colsSql}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);
  }

  async get(key: string | number): Promise<Row | null> {
    const pk = this.getPrimaryKey();
    const sql = `SELECT * FROM ${quoteIdentifier(this.tableName)} WHERE ${quoteIdentifier(pk)} = ?`;
    const row = this.db.prepare(sql).get(key) as Row | undefined;
    if (!row) return null;
    return deserializeRow(row, this.tableSchema);
  }

  async delete(primaryKey: string | number): Promise<void> {
    const pk = this.getPrimaryKey();
    const sql = `DELETE FROM ${quoteIdentifier(this.tableName)} WHERE ${quoteIdentifier(pk)} = ?`;
    this.db.prepare(sql).run(primaryKey);
  }

  async query(
    opts: {
      condition?: ConditionBuilder;
      orderBy?: string;
      limit?: number;
      reverse?: boolean;
      columns?: string[];
    } = {}
  ): Promise<[Row[], string]> {
    const { condition, orderBy, limit = 100, reverse = false, columns } = opts;

    const pk = this.getPrimaryKey();
    const quotedTable = quoteIdentifier(this.tableName);

    // Column selection
    let colsSql: string;
    if (columns && columns.length > 0) {
      const validated = columns.map((c) => validateColumnName(c));
      colsSql = validated
        .map((c) =>
          c === "*"
            ? `${quotedTable}.*`
            : `${quotedTable}.${quoteIdentifier(c)}`
        )
        .join(", ");
    } else {
      colsSql = `${quotedTable}.*`;
    }

    // WHERE clause
    let whereClause = "1=1";
    let params: unknown[] = [];
    if (condition) {
      const [sql, condParams] = this._buildCondition(condition.build());
      whereClause = sql;
      params = condParams;
    }

    // ORDER BY
    let orderByCol: string;
    if (orderBy) {
      validateColumnName(orderBy);
      orderByCol = `${quotedTable}.${quoteIdentifier(orderBy)}`;
    } else {
      orderByCol = `${quotedTable}.${quoteIdentifier(pk)}`;
    }
    const direction = reverse ? "DESC" : "ASC";

    const fetchLimit = limit + 1;
    const sql = `SELECT ${colsSql} FROM ${quotedTable} WHERE ${whereClause} ORDER BY ${orderByCol} ${direction} LIMIT ${fetchLimit}`;

    const rows = this.db.prepare(sql).all(...params) as Row[];
    const deserialized = rows.map((r) => deserializeRow(r, this.tableSchema));

    if (deserialized.length <= limit) {
      return [deserialized, ""];
    }

    // Pop the extra record used to detect another page
    deserialized.pop();
    const cursor = String(deserialized[deserialized.length - 1]?.[pk] ?? "");
    return [deserialized, cursor];
  }

  /** Recursively translate a Condition/ConditionGroup to SQL + params. */
  _buildCondition(condition: Condition | ConditionGroup): [string, unknown[]] {
    if (condition instanceof Condition) {
      const col = validateColumnName(condition.field);
      const quotedField = quoteIdentifier(col);

      // Skip Variable values (not supported for SQL params)
      if (condition.value instanceof Variable) {
        return ["1=1", []];
      }

      switch (condition.operator) {
        case Operator.EQ:
          return [`${quotedField} = ?`, [condition.value]];
        case Operator.NE:
          return [`${quotedField} != ?`, [condition.value]];
        case Operator.GT:
          return [`${quotedField} > ?`, [condition.value]];
        case Operator.LT:
          return [`${quotedField} < ?`, [condition.value]];
        case Operator.GTE:
          return [`${quotedField} >= ?`, [condition.value]];
        case Operator.LTE:
          return [`${quotedField} <= ?`, [condition.value]];
        case Operator.IN:
        case Operator.CONTAINS: {
          const values = Array.isArray(condition.value)
            ? condition.value
            : [condition.value];
          const placeholders = values.map(() => "?").join(", ");
          return [`${quotedField} IN (${placeholders})`, values];
        }
        case Operator.LIKE:
          return [`${quotedField} LIKE ?`, [condition.value]];
        case Operator.IS_NULL:
          return [`${quotedField} IS NULL`, []];
        case Operator.IS_NOT_NULL:
          return [`${quotedField} IS NOT NULL`, []];
        default:
          return ["1=1", []];
      }
    } else {
      // ConditionGroup
      const subClauses: string[] = [];
      const allParams: unknown[] = [];

      for (const sub of condition.conditions) {
        const [sql, params] = this._buildCondition(sub);
        subClauses.push(sql);
        allParams.push(...params);
      }

      if (subClauses.length === 0) {
        return ["1=1", []];
      }
      if (subClauses.length === 1) {
        return [subClauses[0], allParams];
      }

      const op = condition.operator === LogicalOperator.AND ? " AND " : " OR ";
      const combined = subClauses.map((s) => `(${s})`).join(op);
      return [combined, allParams];
    }
  }

  async createIndex(
    indexName: string,
    columns: string[],
    unique = false
  ): Promise<void> {
    validateColumnName(indexName);
    const uniqueStr = unique ? "UNIQUE " : "";
    const colsSql = columns
      .map((c) => quoteIdentifier(validateColumnName(c)))
      .join(", ");
    const sql = `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${quoteIdentifier(this.tableName)} (${colsSql})`;
    this.db.exec(sql);
  }

  async dropIndex(indexName: string): Promise<void> {
    validateColumnName(indexName);
    this.db.exec(`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`);
  }

  async listIndexes(): Promise<IndexDef[]> {
    const sql = "SELECT * FROM sqlite_master WHERE type='index' AND tbl_name=?";
    const rows = this.db.prepare(sql).all(this.tableName) as Row[];
    const indexes: IndexDef[] = [];

    for (const row of rows) {
      // Skip system indexes
      if (row.name.startsWith("sqlite_")) continue;

      const createStmt: string = row.sql;
      if (!createStmt) continue;

      // Parse column names from CREATE INDEX statement
      const colsPart = createStmt.split("(").pop()?.split(")")[0] ?? "";
      const cols = colsPart
        .split(",")
        .map((c: string) => c.trim().replace(/"/g, ""));

      indexes.push({
        name: row.name,
        columns: cols,
        unique: createStmt.toUpperCase().includes("UNIQUE")
      });
    }

    return indexes;
  }
}

// ── SQLiteAdapterFactory ──────────────────────────────────────────────

export class SQLiteAdapterFactory {
  private db: Database.Database;
  private adapters = new Map<string, SQLiteAdapter>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");
    // Set busy timeout to 30 seconds
    this.db.pragma("busy_timeout = 30000");
    // Set synchronous to NORMAL for a balance of safety and speed
    this.db.pragma("synchronous = NORMAL");
  }

  getAdapter(schema: TableSchema): SQLiteAdapter {
    let adapter = this.adapters.get(schema.table_name);
    if (!adapter) {
      adapter = new SQLiteAdapter(this.db, schema);
      this.adapters.set(schema.table_name, adapter);
    }
    return adapter;
  }

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
    this.adapters.clear();
  }
}

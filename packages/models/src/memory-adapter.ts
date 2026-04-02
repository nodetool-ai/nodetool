/**
 * In-memory DatabaseAdapter implementation.
 *
 * Useful for unit/integration tests and ephemeral contexts where no
 * persistence is required. Evaluates ConditionBuilder trees in JS.
 */

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

// ── Condition evaluator ──────────────────────────────────────────────

function evaluateCondition(row: Row, cond: Condition): boolean {
  const val = row[cond.field];
  const target = cond.value instanceof Variable ? null : cond.value;

  switch (cond.operator) {
    case Operator.EQ:
      return val === target;
    case Operator.NE:
      return val !== target;
    case Operator.GT:
      return val > target;
    case Operator.LT:
      return val < target;
    case Operator.GTE:
      return val >= target;
    case Operator.LTE:
      return val <= target;
    case Operator.IN:
      return Array.isArray(target) && target.includes(val);
    case Operator.LIKE: {
      if (typeof target !== "string" || typeof val !== "string") return false;
      // Simple LIKE: % = wildcard
      const regex = new RegExp(
        "^" + target.replace(/%/g, ".*").replace(/_/g, ".") + "$",
        "i"
      );
      return regex.test(val);
    }
    case Operator.CONTAINS:
      return Array.isArray(target) && target.includes(val);
    default:
      return false;
  }
}

function evaluateGroup(row: Row, group: ConditionGroup): boolean {
  const results = group.conditions.map((c) => {
    if (c instanceof Condition) return evaluateCondition(row, c);
    if (c instanceof ConditionGroup) return evaluateGroup(row, c);
    return false;
  });

  return group.operator === LogicalOperator.AND
    ? results.every(Boolean)
    : results.some(Boolean);
}

function matchesCondition(row: Row, builder: ConditionBuilder): boolean {
  return evaluateGroup(row, builder.build());
}

// ── In-memory Adapter ────────────────────────────────────────────────

export class MemoryAdapter implements DatabaseAdapter {
  readonly tableName: string;
  readonly tableSchema: TableSchema;

  private rows = new Map<string | number, Row>();
  private indexes = new Map<string, IndexDef>();

  constructor(schema: TableSchema) {
    this.tableName = schema.table_name;
    this.tableSchema = schema;
  }

  getPrimaryKey(): string {
    return this.tableSchema.primary_key ?? "id";
  }

  async createTable(): Promise<void> {
    // no-op – table already exists in memory
  }

  async dropTable(): Promise<void> {
    this.rows.clear();
    this.indexes.clear();
  }

  async save(item: Row): Promise<void> {
    const pk = this.getPrimaryKey();
    const key = item[pk];
    if (key === undefined || key === null) {
      throw new Error(`Missing primary key "${pk}" in save payload`);
    }

    // Check unique indexes
    for (const idx of this.indexes.values()) {
      if (!idx.unique) continue;
      for (const [existingKey, existingRow] of this.rows) {
        if (existingKey === key) continue; // same row, skip
        const conflict = idx.columns.every(
          (col) => existingRow[col] === item[col]
        );
        if (conflict) {
          throw new Error(
            `Unique index "${idx.name}" violation on columns [${idx.columns.join(", ")}]`
          );
        }
      }
    }

    this.rows.set(key, { ...item });
  }

  async get(key: string | number): Promise<Row | null> {
    const row = this.rows.get(key);
    return row ? { ...row } : null;
  }

  async delete(primaryKey: string | number): Promise<void> {
    this.rows.delete(primaryKey);
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

    let results = Array.from(this.rows.values());

    // Filter
    if (condition) {
      results = results.filter((row) => matchesCondition(row, condition));
    }

    // Sort
    if (orderBy) {
      results.sort((a, b) => {
        const va = a[orderBy];
        const vb = b[orderBy];
        if (va < vb) return -1;
        if (va > vb) return 1;
        return 0;
      });
    }
    if (reverse) results.reverse();

    // Limit
    const hasMore = results.length > limit;
    results = results.slice(0, limit);

    // Column projection
    if (columns && columns.length > 0) {
      results = results.map((row) => {
        const projected: Row = {};
        for (const col of columns) {
          if (col in row) projected[col] = row[col];
        }
        return projected;
      });
    }

    const cursor = hasMore
      ? String(results[results.length - 1]?.[this.getPrimaryKey()] ?? "")
      : "";

    return [results.map((r) => ({ ...r })), cursor];
  }

  async createIndex(
    indexName: string,
    columns: string[],
    unique = false
  ): Promise<void> {
    this.indexes.set(indexName, { name: indexName, columns, unique });
  }

  async dropIndex(indexName: string): Promise<void> {
    this.indexes.delete(indexName);
  }

  async listIndexes(): Promise<IndexDef[]> {
    return Array.from(this.indexes.values());
  }
}

/**
 * Factory that creates MemoryAdapter instances keyed by table schema.
 * Mimics the Python adapter factory that caches per-model class.
 */
export class MemoryAdapterFactory {
  private adapters = new Map<string, MemoryAdapter>();

  getAdapter(schema: TableSchema): MemoryAdapter {
    let adapter = this.adapters.get(schema.table_name);
    if (!adapter) {
      adapter = new MemoryAdapter(schema);
      this.adapters.set(schema.table_name, adapter);
    }
    return adapter;
  }

  /** Drop all adapters (useful for test cleanup). */
  clear(): void {
    this.adapters.clear();
  }
}

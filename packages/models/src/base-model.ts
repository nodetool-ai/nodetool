/**
 * DBModel – base class for database-backed models.
 *
 * Uses Drizzle ORM as the query layer. Supports both SQLite (better-sqlite3)
 * and PostgreSQL (postgres.js) via async methods that work on both dialects.
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { Column, eq, getTableColumns, like, Table } from "drizzle-orm";
import { isShortResourceId } from "@nodetool-ai/protocol";
import { getDb } from "./db.js";

const log = createLogger("nodetool.models");

export enum ModelChangeEvent {
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted"
}

/**
 * Context about one write, attached to the observer notification. The ops
 * belong to that single write — not to a request — so they travel as an
 * argument rather than through ambient state.
 */
export interface ModelChangeMeta {
  /**
   * The per-merge-unit ops the write was made with (the `ui_*` op list a
   * headless bridge attaches to its document mutation). Forwarded on the
   * `resource_change` broadcast so an open editor can merge the external
   * change into its draft per merge unit.
   */
  ops?: unknown[];
}

export type ModelObserverCallback = (
  instance: DBModel,
  event: ModelChangeEvent,
  meta?: ModelChangeMeta
) => void;

export class ModelObserver {
  private static observers = new Map<string | null, ModelObserverCallback[]>();

  static subscribe(callback: ModelObserverCallback, modelClass?: string): void {
    const key = modelClass ?? null;
    const list = ModelObserver.observers.get(key) ?? [];
    list.push(callback);
    ModelObserver.observers.set(key, list);
  }

  static unsubscribe(
    callback: ModelObserverCallback,
    modelClass?: string
  ): void {
    const key = modelClass ?? null;
    const list = ModelObserver.observers.get(key);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx >= 0) list.splice(idx, 1);
  }

  static notify(
    instance: DBModel,
    event: ModelChangeEvent,
    meta?: ModelChangeMeta
  ): void {
    const className = instance.constructor.name;

    for (const cb of ModelObserver.observers.get(className) ?? []) {
      try {
        cb(instance, event, meta);
      } catch (err) {
        log.error(`Observer notification failed for ${className}`, {
          error: String(err)
        });
      }
    }

    for (const cb of ModelObserver.observers.get(null) ?? []) {
      try {
        cb(instance, event, meta);
      } catch (err) {
        log.error("Global observer notification failed", {
          error: String(err)
        });
      }
    }
  }

  static clear(): void {
    ModelObserver.observers.clear();
  }
}

export function createTimeOrderedUuid(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * A deterministic row id for something that must exist at most once per owner —
 * the same `(namespace, key)` pair always yields the same id, so a second
 * install of the same artifact finds the row the first one created instead of
 * duplicating it. Same shape as {@link createTimeOrderedUuid} (32 hex chars),
 * so it drops into any id column.
 */
export function createStableUuid(namespace: string, key: string): string {
  return createHash("sha256")
    .update(`${namespace}\x00${key}`)
    .digest("hex")
    .slice(0, 32);
}

export function computeEtag(data: Record<string, unknown>): string {
  const raw = JSON.stringify(data, Object.keys(data).sort());
  return createHash("md5").update(raw).digest("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle table type varies by dialect; any is required for the base-class pattern.
export type DrizzleTable = any;

// Drizzle's official column accessor. Returns undefined for objects that are
// not real Drizzle tables (e.g. legacy/test doubles), in which case callers
// fall back to enumerable keys.
function drizzleColumns(table: DrizzleTable): Record<string, Column> | undefined {
  return getTableColumns(table as Table) as Record<string, Column> | undefined;
}

function getTableColumn(table: DrizzleTable, colName: string): Column {
  const cols = drizzleColumns(table);
  const col = cols
    ? cols[colName]
    : ((table as Record<string, unknown>)[colName] as Column | undefined);
  if (!col) {
    throw new Error(`Column "${colName}" not found on the table schema.`);
  }
  return col;
}

function getColumnNames(table: DrizzleTable): string[] {
  const cols = drizzleColumns(table);
  if (cols) return Object.keys(cols);
  return Object.keys(table as object).filter((k) => !k.startsWith("_"));
}

/**
 * A `DBModel` subclass as its own static methods see it: constructible into the
 * instance type the caller asked for, and carrying the table metadata those
 * methods read. This is what `this: any` stood for.
 */
export type ModelConstructor<T extends DBModel> = (new (
  data: Record<string, unknown>
) => T) & {
  table: DrizzleTable;
  primaryKey: string;
};

export abstract class DBModel {
  static table: DrizzleTable;

  static primaryKey = "id";

  /**
   * Columns are assigned onto the instance from the row, so a model carries
   * whatever its table declares. `unknown` would make every read of a column a
   * cast at the call site; this stays the widest member type the pattern needs.
   */
  [key: string]: unknown;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  static async create<T extends DBModel>(
    this: ModelConstructor<T>,
    data: Record<string, unknown>
  ): Promise<T> {
    const instance = new this(data) as T;
    await instance.save();
    ModelObserver.notify(instance, ModelChangeEvent.CREATED);
    return instance;
  }

  static async get<T extends DBModel>(
    this: ModelConstructor<T>,
    key: string | number
  ): Promise<T | null> {
    const db = getDb();
    const table = this.table as DrizzleTable;
    const pkCol = getTableColumn(table, this.primaryKey);
    const rows = await db.select().from(table).where(eq(pkCol, key)).limit(1);
    const row = rows[0];
    if (row) return new this(row as Record<string, unknown>) as T;
    // A short resource id (`resource-id.ts` in protocol) resolves by prefix.
    // Only the `id` column, only the exact short length, and only after the
    // exact lookup missed: a numeric key or a table keyed by something else
    // never reaches this query. Two matches is an error, not a guess.
    if (
      this.primaryKey !== "id" ||
      typeof key !== "string" ||
      !isShortResourceId(key)
    ) {
      return null;
    }
    const matches = await db
      .select()
      .from(table)
      .where(like(pkCol, `${key}%`))
      .limit(2);
    if (matches.length > 1) {
      throw new Error(
        `short id "${key}" matches more than one row; use the full id`
      );
    }
    const match = matches[0];
    return match ? (new this(match as Record<string, unknown>) as T) : null;
  }

  beforeSave(): void {}

  async save(): Promise<this> {
    this.beforeSave();
    const ctor = this.constructor as typeof DBModel;
    const db = getDb();
    const table = ctor.table;
    const row = this.toRow();
    const pkCol = getTableColumn(table, ctor.primaryKey);

    await db
      .insert(table)
      .values(row)
      .onConflictDoUpdate({
        // pkCol is a generic Column; the SQLite builder's conflict target
        // wants an IndexColumn, which it is at runtime.
        target: pkCol as Parameters<
          ReturnType<ReturnType<typeof db.insert>["values"]>["onConflictDoUpdate"]
        >[0]["target"],
        set: row
      });

    ModelObserver.notify(this, ModelChangeEvent.UPDATED);
    return this;
  }

  async delete(): Promise<void> {
    const ctor = this.constructor as typeof DBModel;
    const db = getDb();
    const table = ctor.table;
    const pkCol = getTableColumn(table, ctor.primaryKey);
    await db.delete(table).where(eq(pkCol, this.partitionValue()));
    ModelObserver.notify(this, ModelChangeEvent.DELETED);
  }

  async update(data: Partial<Record<string, unknown>>): Promise<this> {
    Object.assign(this, data);
    await this.save();
    return this;
  }

  async reload(): Promise<this> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctor = this.constructor as any;
    const db = getDb();
    const table = (ctor as typeof DBModel).table;
    const pkCol = getTableColumn(table, (ctor as typeof DBModel).primaryKey);
    const rows = await db
      .select()
      .from(table)
      .where(eq(pkCol, this.partitionValue()))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error(`Item not found: ${this.partitionValue()}`);
    const fresh = new ctor(row as Record<string, unknown>);
    Object.assign(this, fresh);
    return this;
  }

  partitionValue(): string | number {
    const ctor = this.constructor as typeof DBModel;
    const value = this[ctor.primaryKey];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(
        `${ctor.name}.${ctor.primaryKey} is not a string or number key.`
      );
    }
    return value;
  }

  toRow() {
    const ctor = this.constructor as typeof DBModel;
    const columnNames = getColumnNames(ctor.table);
    const row: Record<string, unknown> = {};
    for (const col of columnNames) {
      if (col in this) {
        const val = this[col];
        if (val !== null && val !== undefined && typeof val === "object") {
          row[col] = JSON.parse(JSON.stringify(val));
        } else {
          row[col] = val;
        }
      }
    }
    return row;
  }

  getEtag(): string {
    return computeEtag(this.toRow());
  }
}

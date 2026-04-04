/**
 * DBModel – base class for database-backed models.
 *
 * Rewritten to use Drizzle ORM as the query layer.
 * Each concrete model class provides a static `table` pointing to its
 * Drizzle table definition. The base class supplies common CRUD,
 * observer notifications, and etag computation.
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool/config";
import { eq } from "drizzle-orm";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";
import { getDb } from "./db.js";

const log = createLogger("nodetool.models");

// ── Observer ─────────────────────────────────────────────────────────

export enum ModelChangeEvent {
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted"
}

export type ModelObserverCallback = (
  instance: DBModel,
  event: ModelChangeEvent
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

  static notify(instance: DBModel, event: ModelChangeEvent): void {
    const className = instance.constructor.name;

    // Intentional: catch and log observer errors to prevent one failing observer
    // from blocking notifications to remaining observers.

    // Class-specific observers
    for (const cb of ModelObserver.observers.get(className) ?? []) {
      try {
        cb(instance, event);
      } catch (err) {
        log.error(`Observer notification failed for ${className}`, {
          error: String(err)
        });
      }
    }

    // Global observers
    for (const cb of ModelObserver.observers.get(null) ?? []) {
      try {
        cb(instance, event);
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

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a time-ordered UUID (v4 for simplicity; Python uses uuid1). */
export function createTimeOrderedUuid(): string {
  return randomUUID().replace(/-/g, "");
}

/** Compute an MD5 etag from a plain object. */
export function computeEtag(data: Record<string, unknown>): string {
  const raw = JSON.stringify(data, Object.keys(data).sort());
  return createHash("md5").update(raw).digest("hex");
}

// ── DBModel Base ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle tables have deeply nested generics; `any` is required for the base-class pattern.
export type DrizzleTable = SQLiteTableWithColumns<any>;

/**
 * Helper to get column object from table by name.
 * Needed because Drizzle tables store columns as properties keyed by column name.
 * Returns the Drizzle column object for use with query builders (eq, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle column type varies per table; callers pass result to eq() which accepts any column.
function getTableColumn(table: DrizzleTable, colName: string): any {
  return (table as Record<string, unknown>)[colName];
}

/**
 * Get column names from a Drizzle table.
 */
function getColumnNames(table: DrizzleTable): string[] {
  // Drizzle stores column config under Symbol.for("drizzle:Columns")
  const cols = (table as unknown as Record<symbol, Record<string, unknown>>)[
    Symbol.for("drizzle:Columns")
  ];
  if (cols) return Object.keys(cols);
  // Fallback: iterate own enumerable string keys that look like columns
  return Object.keys(table).filter((k) => !k.startsWith("_"));
}

export abstract class DBModel {
  /** Subclass must set this to its Drizzle table definition. */
  static table: DrizzleTable;

  /** Primary key column name. Override for non-'id' PKs (e.g. RunLease uses 'run_id'). */
  static primaryKey = "id";

  // Allow dynamic property access for column data — DBModel instances store column values as properties.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this: any` enables static polymorphism across subclasses.
  static async create<T extends DBModel>(
    this: any,
    data: Record<string, unknown>
  ): Promise<T> {
    const instance = new this(data) as T;
    await instance.save();
    ModelObserver.notify(instance, ModelChangeEvent.CREATED);
    return instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this: any` enables static polymorphism across subclasses.
  static async get<T extends DBModel>(
    this: any,
    key: string | number
  ): Promise<T | null> {
    const db = getDb();
    const table = this.table as DrizzleTable;
    const pkCol = getTableColumn(table, this.primaryKey);
    const row = db.select().from(table).where(eq(pkCol, key)).get();
    if (!row) return null;
    return new this(row as Record<string, unknown>) as T;
  }

  /** Hook called before save. Subclasses may override. */
  beforeSave(): void {}

  async save(): Promise<this> {
    this.beforeSave();
    const ctor = this.constructor as typeof DBModel;
    const db = getDb();
    const table = ctor.table;
    const row = this.toRow();
    const pkCol = getTableColumn(table, ctor.primaryKey);

    db.insert(table)
      .values(row)
      .onConflictDoUpdate({
        target: pkCol,
        set: row
      })
      .run();

    ModelObserver.notify(this, ModelChangeEvent.UPDATED);
    return this;
  }

  async delete(): Promise<void> {
    const ctor = this.constructor as typeof DBModel;
    const db = getDb();
    const table = ctor.table;
    const pkCol = getTableColumn(table, ctor.primaryKey);
    db.delete(table).where(eq(pkCol, this.partitionValue())).run();
    ModelObserver.notify(this, ModelChangeEvent.DELETED);
  }

  async update(data: Partial<Record<string, unknown>>): Promise<this> {
    Object.assign(this, data);
    await this.save();
    return this;
  }

  async reload(): Promise<this> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constructor must be callable with `new` for dynamic instantiation.
    const ctor = this.constructor as any;
    const db = getDb();
    const table = (ctor as typeof DBModel).table;
    const pkCol = getTableColumn(table, (ctor as typeof DBModel).primaryKey);
    const row = db
      .select()
      .from(table)
      .where(eq(pkCol, this.partitionValue()))
      .get();
    if (!row) throw new Error(`Item not found: ${this.partitionValue()}`);
    const fresh = new ctor(row as Record<string, unknown>);
    Object.assign(this, fresh);
    return this;
  }

  /** Get the primary key value for this instance. */
  partitionValue(): string | number {
    const ctor = this.constructor as typeof DBModel;
    return this[ctor.primaryKey];
  }

  /** Serialize to a plain row object for Drizzle. */
  toRow(): Record<string, unknown> {
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

  /** Compute an ETag for this instance. */
  getEtag(): string {
    return computeEtag(this.toRow());
  }
}

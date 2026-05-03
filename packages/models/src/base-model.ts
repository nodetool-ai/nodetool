/**
 * DBModel – base class for database-backed models.
 *
 * Uses Drizzle ORM as the query layer. Supports both SQLite (better-sqlite3)
 * and PostgreSQL (postgres.js) via async methods that work on both dialects.
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { eq } from "drizzle-orm";
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

    for (const cb of ModelObserver.observers.get(className) ?? []) {
      try {
        cb(instance, event);
      } catch (err) {
        log.error(`Observer notification failed for ${className}`, {
          error: String(err)
        });
      }
    }

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

export function createTimeOrderedUuid(): string {
  return randomUUID().replace(/-/g, "");
}

export function computeEtag(data: Record<string, unknown>): string {
  const raw = JSON.stringify(data, Object.keys(data).sort());
  return createHash("md5").update(raw).digest("hex");
}

// ── DBModel Base ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle table type varies by dialect; any is required for the base-class pattern.
export type DrizzleTable = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTableColumn(table: DrizzleTable, colName: string): any {
  return (table as Record<string, unknown>)[colName];
}

function getColumnNames(table: DrizzleTable): string[] {
  const cols = (table as unknown as Record<symbol, Record<string, unknown>>)[
    Symbol.for("drizzle:Columns")
  ];
  if (cols) return Object.keys(cols);
  return Object.keys(table).filter((k) => !k.startsWith("_"));
}

export abstract class DBModel {
  static table: DrizzleTable;

  static primaryKey = "id";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async create<T extends DBModel>(
    this: any,
    data: Record<string, unknown>
  ): Promise<T> {
    const instance = new this(data) as T;
    await instance.save();
    ModelObserver.notify(instance, ModelChangeEvent.CREATED);
    return instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async get<T extends DBModel>(
    this: any,
    key: string | number
  ): Promise<T | null> {
    const db = getDb();
    const table = this.table as DrizzleTable;
    const pkCol = getTableColumn(table, this.primaryKey);
    const rows = await db.select().from(table).where(eq(pkCol, key)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return new this(row as Record<string, unknown>) as T;
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
        target: pkCol,
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
    return this[ctor.primaryKey];
  }

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

  getEtag(): string {
    return computeEtag(this.toRow());
  }
}

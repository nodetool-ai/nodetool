/**
 * DBModel – base class for database-backed models.
 *
 * Port of Python's `nodetool.models.base_model.DBModel`.
 *
 * Each concrete model class provides a static `tableSchema` and a
 * registered `DatabaseAdapter`. The base class supplies common CRUD,
 * query, index management, observer notifications, and etag computation.
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.models");
import type { ConditionBuilder } from "./condition-builder.js";
import type { DatabaseAdapter, Row, TableSchema, IndexDef } from "./database-adapter.js";

// ── Observer ─────────────────────────────────────────────────────────

export enum ModelChangeEvent {
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
}

export type ModelObserverCallback = (
  instance: DBModel,
  event: ModelChangeEvent,
) => void;

export class ModelObserver {
  private static observers = new Map<
    string | null,
    ModelObserverCallback[]
  >();

  static subscribe(
    callback: ModelObserverCallback,
    modelClass?: string,
  ): void {
    const key = modelClass ?? null;
    const list = ModelObserver.observers.get(key) ?? [];
    list.push(callback);
    ModelObserver.observers.set(key, list);
  }

  static unsubscribe(
    callback: ModelObserverCallback,
    modelClass?: string,
  ): void {
    const key = modelClass ?? null;
    const list = ModelObserver.observers.get(key);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx >= 0) list.splice(idx, 1);
  }

  static notify(instance: DBModel, event: ModelChangeEvent): void {
    const className = instance.constructor.name;

    // Class-specific observers
    for (const cb of ModelObserver.observers.get(className) ?? []) {
      try {
        cb(instance, event);
      } catch (err) {
        log.error(`Observer notification failed for ${className}`, { error: String(err) });
      }
    }

    // Global observers
    for (const cb of ModelObserver.observers.get(null) ?? []) {
      try {
        cb(instance, event);
      } catch (err) {
        log.error("Global observer notification failed", { error: String(err) });
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
export function computeEtag(data: Row): string {
  const raw = JSON.stringify(data, Object.keys(data).sort());
  return createHash("md5").update(raw).digest("hex");
}

// ── Index Decorator Data ─────────────────────────────────────────────

export interface IndexSpec {
  name: string;
  columns: string[];
  unique: boolean;
}

// ── AdapterResolver ──────────────────────────────────────────────────

/**
 * An AdapterResolver is a function that, given a TableSchema, returns
 * the appropriate DatabaseAdapter. Concrete model classes store a
 * resolver so that tests can swap in a MemoryAdapter while production
 * uses SQLite or Postgres.
 */
export type AdapterResolver = (schema: TableSchema) => DatabaseAdapter;

let _globalResolver: AdapterResolver | null = null;

/** Set a global adapter resolver used by all DBModel subclasses. */
export function setGlobalAdapterResolver(resolver: AdapterResolver): void {
  _globalResolver = resolver;
}

/** Get the current global adapter resolver. */
export function getGlobalAdapterResolver(): AdapterResolver | null {
  return _globalResolver;
}

// ── DBModel Base ─────────────────────────────────────────────────────

 
export type ModelClass<T extends DBModel = DBModel> = {
  new (data: Row): T;
  name: string;
  schema: TableSchema;
  indexes: IndexSpec[];
  adapterResolver?: AdapterResolver;
  getAdapter(this: ModelClass<T>): DatabaseAdapter;
  createTable(this: ModelClass<T>): Promise<void>;
  dropTable(this: ModelClass<T>): Promise<void>;
  listIndexes(this: ModelClass<T>): Promise<IndexDef[]>;
  create(this: ModelClass<T>, data: Row): Promise<T>;
  get(this: ModelClass<T>, key: string | number): Promise<T | null>;
  query(
    this: ModelClass<T>,
    opts?: {
      condition?: ConditionBuilder;
      limit?: number;
      orderBy?: string;
      reverse?: boolean;
      columns?: string[];
    },
  ): Promise<[T[], string]>;
};

export abstract class DBModel {
  /** Subclass must set this. */
  static schema: TableSchema;

  /** Indexes defined on this model. */
  static indexes: IndexSpec[] = [];

  /** Optional per-class adapter resolver (overrides global). */
  static adapterResolver?: AdapterResolver;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  constructor(data: Row) {
    Object.assign(this, data);
  }

  // ── Adapter resolution ───────────────────────────────────────────

  static getAdapter<T extends DBModel>(
    this: ModelClass<T>,
  ): DatabaseAdapter {
    const resolver = this.adapterResolver ?? _globalResolver;
    if (!resolver) {
      throw new Error(
        `No adapter resolver set for ${this.name}. ` +
          `Call setGlobalAdapterResolver() or set ${this.name}.adapterResolver.`,
      );
    }
    return resolver(this.schema);
  }

  // ── Table / Index management ─────────────────────────────────────

  static async createTable<T extends DBModel>(
    this: ModelClass<T>,
  ): Promise<void> {
    const adapter = this.getAdapter();
    await adapter.createTable();
    for (const idx of this.indexes) {
      await adapter.createIndex(idx.name, idx.columns, idx.unique);
    }
  }

  static async dropTable<T extends DBModel>(
    this: ModelClass<T>,
  ): Promise<void> {
    const adapter = this.getAdapter();
    for (const idx of this.indexes) {
      await adapter.dropIndex(idx.name);
    }
    await adapter.dropTable();
  }

  static async listIndexes<T extends DBModel>(
    this: ModelClass<T>,
  ): Promise<IndexDef[]> {
    return this.getAdapter().listIndexes();
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  static async create<T extends DBModel>(
    this: ModelClass<T>,
    data: Row,
  ): Promise<T> {
    const instance = new this(data);
    await instance.save();
    ModelObserver.notify(instance, ModelChangeEvent.CREATED);
    return instance;
  }

  static async get<T extends DBModel>(
    this: ModelClass<T>,
    key: string | number,
  ): Promise<T | null> {
    const adapter = this.getAdapter();
    const row = await adapter.get(key);
    if (!row) return null;
    return new this(row);
  }

  static async query<T extends DBModel>(
    this: ModelClass<T>,
    opts?: {
      condition?: ConditionBuilder;
      limit?: number;
      orderBy?: string;
      reverse?: boolean;
      columns?: string[];
    },
  ): Promise<[T[], string]> {
    const adapter = this.getAdapter();
    const [rows, cursor] = await adapter.query(opts);
    const items: T[] = [];
    for (const row of rows) {
      try {
        items.push(new this(row));
      } catch {
        // skip malformed rows (matches Python's try_load_model)
      }
    }
    return [items, cursor];
  }

  // ── Instance methods ─────────────────────────────────────────────

  /** Hook called before save. Subclasses may override. */
  beforeSave(): void {}

  async save(): Promise<this> {
    this.beforeSave();
    const ctor = this.constructor as ModelClass;
    const adapter = ctor.getAdapter();
    await adapter.save(this.toRow());
    ModelObserver.notify(this, ModelChangeEvent.UPDATED);
    return this;
  }

  async delete(): Promise<void> {
    const ctor = this.constructor as ModelClass;
    const adapter = ctor.getAdapter();
    await adapter.delete(this.partitionValue());
    ModelObserver.notify(this, ModelChangeEvent.DELETED);
  }

  async update(data: Partial<Row>): Promise<this> {
    Object.assign(this, data);
    await this.save();
    return this;
  }

  async reload(): Promise<this> {
    const ctor = this.constructor as ModelClass;
    const adapter = ctor.getAdapter();
    const row = await adapter.get(this.partitionValue());
    if (!row) throw new Error(`Item not found: ${this.partitionValue()}`);
    Object.assign(this, row);
    return this;
  }

  /** Get the primary key value for this instance. */
  partitionValue(): string | number {
    const ctor = this.constructor as ModelClass;
    const pk = ctor.schema.primary_key ?? "id";
    return this[pk];
  }

  /** Serialize to a plain row object. */
  toRow(): Row {
    const ctor = this.constructor as ModelClass;
    const row: Row = {};
    for (const col of Object.keys(ctor.schema.columns)) {
      if (col in this) {
        const val = this[col];
        // Serialize objects/arrays as JSON strings for storage
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

/**
 * A save that keeps the revision it replaces as a version, in the same
 * transaction as its compare-and-set. The version row and the new revision
 * are written together or not at all, so a save that loses the
 * compare-and-set leaves no version behind, and a crash cannot leave one
 * without the other.
 */
import { forUpdate, getDbType, getPortableDb, type DbTransaction } from "./db.js";

/** The version a save writes of the revision it replaces. */
export interface KeepRevision {
  /** The version's name, or null to keep the stored document's name. */
  name: string | null;
  /** The version's save type. Choose one the autosave pruning never removes. */
  saveType: string;
  /** The version's description, where the version table has one. */
  description?: string | null;
}

/**
 * The statements of one save. Each returns a Drizzle builder built on `tx`:
 * the helper runs it synchronously on SQLite and awaits it on PostgreSQL.
 */
export interface KeptRevisionSave<Stored> {
  /** Select the stored row only when its `updated_at` is the expected one. */
  stored(tx: DbTransaction): unknown;
  /** Select `max(version)` of the document's versions as `value`. */
  highestVersion(tx: DbTransaction): unknown;
  /** Insert the version row for `stored` with number `version`. */
  keep(tx: DbTransaction, stored: Stored, version: number): unknown;
  /** The compare-and-set update, returning the new row. */
  write(tx: DbTransaction): unknown;
}

/** Synchronous builder methods of better-sqlite3 Drizzle queries. */
interface SyncBuilder {
  get(): unknown;
  run(): unknown;
}

function versionAfter(top: unknown): number {
  const value = (top as { value?: unknown } | undefined)?.value;
  return Number(value ?? 0) + 1;
}

/**
 * Run `save` in one transaction. Returns the updated row, or null when the
 * stored revision was not the expected one: then nothing was written.
 */
export async function saveKeepingRevision<Stored, Row>(
  save: KeptRevisionSave<Stored>
): Promise<Row | null> {
  const db = getPortableDb();
  if (getDbType() === "sqlite") {
    // better-sqlite3 transactions must be fully synchronous.
    return db.transaction((tx: DbTransaction): Row | null => {
      const stored = (save.stored(tx) as SyncBuilder).get() as Stored | undefined;
      if (!stored) return null;
      const top = (save.highestVersion(tx) as SyncBuilder).get();
      (save.keep(tx, stored, versionAfter(top)) as SyncBuilder).run();
      return ((save.write(tx) as SyncBuilder).get() as Row | undefined) ?? null;
    });
  }
  return db.transaction(async (tx: DbTransaction): Promise<Row | null> => {
    // The row lock makes the version number and the write one step for
    // every writer of this document.
    const [stored] = (await forUpdate(
      save.stored(tx) as PromiseLike<Stored[]>
    )) as Stored[];
    if (!stored) return null;
    const [top] = (await (save.highestVersion(tx) as PromiseLike<unknown[]>)) ?? [];
    await (save.keep(tx, stored, versionAfter(top)) as PromiseLike<unknown>);
    const [row] = (await (save.write(tx) as PromiseLike<Row[]>)) ?? [];
    return row ?? null;
  });
}

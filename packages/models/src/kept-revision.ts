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
 * A Drizzle statement built on the transaction. The helper runs it with
 * `get` or `run` on SQLite and awaits it on PostgreSQL, where a select
 * resolves to its rows.
 */
export interface SaveStatement extends PromiseLike<StatementResult> {
  get(): StatementResult | undefined;
  run(): StatementResult;
}

/**
 * What a statement returns: a row or a run result, or on PostgreSQL the
 * rows of a select.
 */
export type StatementResult = object;

/** The answer of the `highestVersion` select. */
interface HighestVersion {
  value?: number | string | null;
}

/** The statements of one save, each built on `tx`. */
export interface KeptRevisionSave<Stored> {
  /** Select the stored row only when its `updated_at` is the expected one. */
  stored(tx: DbTransaction): SaveStatement;
  /** Select `max(version)` of the document's versions as `value`. */
  highestVersion(tx: DbTransaction): SaveStatement;
  /** Insert the version row for `stored` with number `version`. */
  keep(tx: DbTransaction, stored: Stored, version: number): SaveStatement;
  /** The compare-and-set update, returning the new row. */
  write(tx: DbTransaction): SaveStatement;
}

function versionAfter(top: HighestVersion | undefined): number {
  return Number(top?.value ?? 0) + 1;
}

/** The first row a PostgreSQL select or returning statement resolved to. */
function firstRow(rows: unknown): StatementResult | undefined {
  return Array.isArray(rows) ? (rows[0] as StatementResult | undefined) : undefined;
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
      const stored = save.stored(tx).get() as Stored | undefined;
      if (!stored) return null;
      const top = save.highestVersion(tx).get() as HighestVersion | undefined;
      save.keep(tx, stored, versionAfter(top)).run();
      return (save.write(tx).get() as Row | undefined) ?? null;
    });
  }
  return db.transaction(async (tx: DbTransaction): Promise<Row | null> => {
    // The row lock makes the version number and the write one step for
    // every writer of this document.
    const stored = firstRow(await forUpdate(save.stored(tx))) as Stored | undefined;
    if (!stored) return null;
    const top = firstRow(await save.highestVersion(tx)) as HighestVersion | undefined;
    await save.keep(tx, stored, versionAfter(top));
    return (firstRow(await save.write(tx)) as Row | undefined) ?? null;
  });
}

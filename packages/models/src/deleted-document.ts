/**
 * Deleted documents kept for a restore period
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage", WP2.2, PRD D4).
 *
 * A model that deletes a document while retention is on writes the
 * document's row and the rows that belong to it into
 * `nodetool_deleted_documents` and deletes them, in one transaction, so the
 * live tables and their read paths are unchanged. The owner can restore the
 * document under the same id until its purge time. The purge job deletes the
 * kept rows after that, and "end the restore period now" purges one at once.
 *
 * Retention is off unless the host turns it on with
 * {@link setDocumentRetentionDays}. A server for many accounts turns it on;
 * a desktop server leaves it off and deletes at once, as before.
 */
import { and, asc, desc, eq, gt, isNull, lte, or, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createLogger } from "@nodetool-ai/config";
import { createTimeOrderedUuid } from "./base-model.js";
import {
  allowLegacyProjectWritesForTests,
  forUpdate,
  getDbType,
  getPortableDb,
  type DbTransaction
} from "./db.js";
import { deletedDocuments } from "./schema/deleted-documents.js";
import { projects } from "./schema/projects.js";
import {
  documentAdmittedFiles,
  documentRefSets,
  documentRefs
} from "./schema/document-refs.js";

/** The rows of one table that belong to a deleted document. */
export type RetainedRows = Record<string, unknown>[];

/**
 * What a kind keeps of a deleted document: its row and, by table name, the
 * rows that belong to it. Only the kind that wrote it reads it.
 */
export interface DeletedDocumentPayload {
  row: Record<string, unknown>;
  dependents: Record<string, RetainedRows>;
  /**
   * A project only: the documents its delete moved to the deleted
   * documents. A restore of the project brings back these and no document
   * that was deleted before it.
   */
  members?: DeletedDocumentMember[];
}

/** One document a project delete moved to the deleted documents. */
export interface DeletedDocumentMember {
  kind: string;
  documentId: string;
}

/**
 * One statement of a transaction body. {@link runDocumentTransaction} runs
 * it with `all` or `run` on SQLite, where the transaction is synchronous, and
 * awaits it on PostgreSQL.
 */
export interface TransactionStep {
  query: unknown;
  rows: boolean;
}

/** A transaction body: it yields each statement and receives its rows. */
export type TransactionBody<R> = (tx: DbTransaction) => Generator<TransactionStep, R, RetainedRows>;

/** A statement whose rows the body reads: a select or a `returning` write. */
export function rowsOf(query: unknown): TransactionStep {
  return { query, rows: true };
}

/** A write whose result the body does not read. */
export function runOf(query: unknown): TransactionStep {
  return { query, rows: false };
}

/**
 * A select that locks the rows it reads until the transaction ends. SQLite
 * needs no lock: its transaction runs synchronously and alone.
 */
export function lockedRows(query: unknown): TransactionStep {
  return rowsOf(getDbType() === "sqlite" ? query : forUpdate(query));
}

/** A Drizzle statement built on a SQLite transaction. */
interface SqliteStatement {
  all(): RetainedRows;
  run(): void;
}

/** Runs `body` in one transaction. A throw anywhere rolls all of it back. */
export async function runDocumentTransaction<R>(body: TransactionBody<R>): Promise<R> {
  const db = getPortableDb();
  if (getDbType() === "sqlite") {
    // better-sqlite3 transactions must be fully synchronous.
    return db.transaction((tx: DbTransaction): R => {
      const steps = body(tx);
      let next = steps.next([]);
      while (!next.done) {
        const statement = next.value.query as SqliteStatement;
        if (next.value.rows) {
          next = steps.next(statement.all());
        } else {
          statement.run();
          next = steps.next([]);
        }
      }
      return next.value;
    });
  }
  return db.transaction(async (tx: DbTransaction): Promise<R> => {
    const steps = body(tx);
    let next = steps.next([]);
    while (!next.done) {
      const result = await (next.value.query as PromiseLike<unknown>);
      next = steps.next(next.value.rows && Array.isArray(result) ? (result as RetainedRows) : []);
    }
    return next.value;
  });
}

/** How a kind puts a deleted document back. */
export interface DeletedDocumentKind {
  /**
   * The statements that recreate the document from `payload`, run in the
   * transaction that holds the kept row and deletes it. Each insert is
   * insert-only: a document that exists again under the id makes it throw,
   * and nothing changes. A row's file is not written here.
   */
  restore(tx: DbTransaction, payload: DeletedDocumentPayload): Generator<TransactionStep, void, RetainedRows>;
  /**
   * Runs after the restore committed, for what lives outside the database,
   * such as the document's file. It must not throw. A crash before it ends
   * leaves a live document that the next save completes.
   */
  restored?(payload: DeletedDocumentPayload): Promise<void>;
  /**
   * Removes what the kind kept outside the payload, before the purge
   * deletes the kept row. A project uses it to delete the content that
   * stayed behind its tombstone. Throws to leave the row for the next run.
   */
  purge?(entry: { userId: string; documentId: string; payload: DeletedDocumentPayload }): Promise<void>;
}

/** A deleted document as its owner's list shows it. */
export interface DeletedDocumentEntry {
  kind: string;
  documentId: string;
  projectId: string | null;
  name: string;
  deletedAt: string;
  purgeAt: string;
}

/** Why a restore did not happen. */
export type RestoreDeletedOutcome =
  | { outcome: "restored" }
  | { outcome: "not_found" }
  | { outcome: "failed"; reason: string };

/** A table whose rows belong to a document, and the condition that finds them. */
export interface DependentTable {
  name: string;
  table: SQLiteTable;
  where: SQL;
}

/**
 * The reference rows of a document (WP1.5). They are kept with it, so a
 * restored document is readable by the same people as before.
 */
export function documentRefTables(kind: string, documentId: string): DependentTable[] {
  return [
    {
      name: "document_refs",
      table: documentRefs,
      where: and(eq(documentRefs.document_type, kind), eq(documentRefs.document_id, documentId)) as SQL
    },
    {
      name: "document_ref_sets",
      table: documentRefSets,
      where: and(eq(documentRefSets.document_type, kind), eq(documentRefSets.document_id, documentId)) as SQL
    },
    {
      name: "document_admitted_files",
      table: documentAdmittedFiles,
      where: and(
        eq(documentAdmittedFiles.document_type, kind),
        eq(documentAdmittedFiles.document_id, documentId)
      ) as SQL
    }
  ];
}

/** Reads the rows of each dependent table, by table name. */
/** Inserts kept rows back into each dependent table that `tables` names. */
export function* insertDependents(
  tx: DbTransaction,
  tables: DependentTable[],
  dependents: Record<string, RetainedRows>
): Generator<TransactionStep, void, RetainedRows> {
  for (const { name, table } of tables) {
    const rows = dependents[name] ?? [];
    if (rows.length > 0) {
      yield runOf(tx.insert(table).values(rows as never));
    }
  }
}

/**
 * Inserts the kept row of a document, insert-only. Its file fields are
 * cleared: the file was deleted with the document, and the sync writes a new
 * one after the restore commits, which records them again.
 */
export function insertDocumentRow(tx: DbTransaction, table: SQLiteTable, row: Record<string, unknown>): TransactionStep {
  const fresh: Record<string, unknown> = { ...row };
  for (const field of ["file_path", "file_hash", "file_error"]) {
    if (field in fresh) fresh[field] = null;
  }
  return runOf(tx.insert(table).values(fresh as never));
}

/** The document a delete removes: its row and the rows that belong to it. */
export interface DocumentDelete {
  kind: string;
  userId: string;
  table: SQLiteTable;
  /** Finds the document's row by full id and owner. */
  where: SQL;
  dependents: DependentTable[];
  /** The dependent that holds the document's grants, read for `sharedWith`. */
  grants: string;
  /** The row's project and name, for the deleted list. */
  describe(row: Record<string, unknown>): { documentId: string; projectId: string | null; name: string };
}

/** What a delete removed: the row, and the users its grants named. */
export interface DeletedDocumentRow {
  row: Record<string, unknown>;
  sharedWith: string[];
}

/**
 * Deletes a document and its dependent rows in one transaction, and while
 * retention is on keeps them first in the same transaction. The row is
 * locked as it is read, so a save of the document waits for the delete and
 * then finds no row: the copy kept is the last revision. Returns the deleted
 * row and the users it was shared with, or null when there was none: then
 * nothing changed, so a repeated delete keeps the copy the first one made.
 * The grants go in the same transaction, so a change feed that tells the
 * people a document was shared with cannot read them afterwards.
 */
export async function deleteDocumentKeeping(
  spec: DocumentDelete,
  now: Date = new Date()
): Promise<DeletedDocumentRow | null> {
  const days = retentionDays;
  return runDocumentTransaction(function* (tx) {
    const [row] = yield lockedRows(tx.select().from(spec.table).where(spec.where).limit(1));
    if (!row) return null;
    const dependents: Record<string, RetainedRows> = {};
    for (const { name, table, where } of spec.dependents) {
      if (days !== null || name === spec.grants) {
        dependents[name] = yield rowsOf(tx.select().from(table).where(where));
      }
    }
    const sharedWith = [
      ...new Set((dependents[spec.grants] ?? []).map((grant) => grant["user_id"]).filter((id): id is string => typeof id === "string"))
    ];
    if (days !== null) {
      const { documentId, projectId, name } = spec.describe(row);
      const entry = keptEntry({ kind: spec.kind, documentId, userId: spec.userId, projectId, name, payload: { row, dependents } }, days, now);
      // A kept copy of an earlier life of this id is replaced: the live row
      // is newer, and only a restore or a recreation brought it back.
      yield runOf(
        tx
          .insert(deletedDocuments)
          .values(entry)
          .onConflictDoUpdate({ target: [deletedDocuments.kind, deletedDocuments.document_id], set: replaced(entry) })
      );
    }
    for (const { table, where } of spec.dependents) {
      yield runOf(tx.delete(table).where(where));
    }
    yield runOf(tx.delete(spec.table).where(spec.where));
    return { row, sharedWith };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const log = createLogger("nodetool.models.deleted-documents");

// Host configuration, set once at start-up before requests are served, as
// the document file syncs are with setWorkflowFileSync.
let retentionDays: number | null = null;
const kinds = new Map<string, DeletedDocumentKind>();

/**
 * Turns retention on for `days`, or off with null. Throws for a period that
 * is not a positive number of days.
 */
export function setDocumentRetentionDays(days: number | null): void {
  if (days !== null && !(Number.isFinite(days) && days > 0)) {
    throw new Error(`Document retention must be a positive number of days, got ${days}`);
  }
  retentionDays = days;
}

/** The restore period in days, or null when deletes are immediate. */
export function documentRetentionDays(): number | null {
  return retentionDays;
}

/** Called by each kind's model when it loads. */
export function registerDeletedDocumentKind(
  kind: string,
  handler: DeletedDocumentKind
): void {
  kinds.set(kind, handler);
}

interface KeptInput {
  kind: string;
  documentId: string;
  userId: string;
  projectId: string | null;
  name: string;
  payload: DeletedDocumentPayload;
}

function keptEntry(input: KeptInput, days: number, now: Date): typeof deletedDocuments.$inferInsert {
  return {
    id: createTimeOrderedUuid(),
    kind: input.kind,
    document_id: input.documentId,
    user_id: input.userId,
    project_id: input.projectId,
    name: input.name,
    payload: JSON.stringify(input.payload),
    deleted_at: now.toISOString(),
    purge_at: new Date(now.getTime() + days * DAY_MS).toISOString(),
    purging_since: null
  };
}

/** The columns a later delete of the same document replaces. */
function replaced(entry: typeof deletedDocuments.$inferInsert) {
  return {
    user_id: entry.user_id,
    project_id: entry.project_id,
    name: entry.name,
    payload: entry.payload,
    deleted_at: entry.deleted_at,
    purge_at: entry.purge_at,
    purging_since: null
  };
}

function memberKey(member: DeletedDocumentMember): string {
  return `${member.kind}\u0000${member.documentId}`;
}

/**
 * Keeps a deleted project, whose row stays behind its tombstone. A repeated
 * delete of the same project keeps the first copy and its times, and adds
 * the documents it moved to the members. A project whose purge has started
 * is left alone. Returns the purge time, or null while retention is off.
 */
export async function retainDeletedProject(input: KeptInput, now: Date = new Date()): Promise<string | null> {
  const days = retentionDays;
  if (days === null) return null;
  return runDocumentTransaction(function* (tx) {
    const [existing] = yield lockedRows(
      tx
        .select()
        .from(deletedDocuments)
        .where(and(eq(deletedDocuments.kind, input.kind), eq(deletedDocuments.document_id, input.documentId)))
        .limit(1)
    );
    if (!existing) {
      const entry = keptEntry(input, days, now);
      yield runOf(tx.insert(deletedDocuments).values(entry));
      return entry.purge_at;
    }
    const kept = existing as typeof deletedDocuments.$inferSelect;
    if (kept.purging_since !== null) return kept.purge_at;
    const payload = JSON.parse(kept.payload) as DeletedDocumentPayload;
    const members = new Map<string, DeletedDocumentMember>();
    for (const member of [...(payload.members ?? []), ...(input.payload.members ?? [])]) {
      members.set(memberKey(member), member);
    }
    payload.members = [...members.values()];
    yield runOf(
      tx.update(deletedDocuments).set({ payload: JSON.stringify(payload) }).where(eq(deletedDocuments.id, kept.id))
    );
    return kept.purge_at;
  });
}

/** The owner's deleted documents that can still be restored, newest first. */
export async function listDeletedDocuments(
  userId: string,
  options: { projectId?: string; now?: Date } = {}
): Promise<DeletedDocumentEntry[]> {
  const now = (options.now ?? new Date()).toISOString();
  const conditions = [
    eq(deletedDocuments.user_id, userId),
    gt(deletedDocuments.purge_at, now),
    isNull(deletedDocuments.purging_since)
  ];
  if (options.projectId !== undefined) {
    conditions.push(eq(deletedDocuments.project_id, options.projectId));
  }
  const rows = await getPortableDb()
    .select()
    .from(deletedDocuments)
    .where(and(...conditions))
    .orderBy(desc(deletedDocuments.deleted_at));
  return rows.map((row) => ({
    kind: row.kind,
    documentId: row.document_id,
    projectId: row.project_id,
    name: row.name,
    deletedAt: row.deleted_at,
    purgeAt: row.purge_at
  }));
}

async function findOwned(userId: string, kind: string, documentId: string, now: Date) {
  const [row] = await getPortableDb()
    .select()
    .from(deletedDocuments)
    .where(
      and(
        eq(deletedDocuments.user_id, userId),
        eq(deletedDocuments.kind, kind),
        eq(deletedDocuments.document_id, documentId),
        gt(deletedDocuments.purge_at, now.toISOString()),
        isNull(deletedDocuments.purging_since)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Why the project of a document refuses its restore, or null when it does not. */
function* projectRefusal(tx: DbTransaction, projectId: string, userId: string): Generator<TransactionStep, string | null, RetainedRows> {
  if (projectId === "default") return null;
  // Locked, so a project delete cannot pass between this check and the insert.
  const [project] = yield lockedRows(
    tx
      .select({ deleted_at: projects.deleted_at })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
      .limit(1)
  );
  if (!project) {
    return allowLegacyProjectWritesForTests() ? null : "The document's project is gone.";
  }
  return project["deleted_at"] === null ? null : "The document's project is deleted. Restore the project first.";
}

class RestoreRefused extends Error {}

/**
 * Puts the owner's deleted document back under its id. A row past its purge
 * time, a row whose purge started, another user's row and an unknown kind
 * are not found.
 *
 * The kept row is locked, the document and its rows are inserted, and the
 * kept row is deleted, in one transaction. A purge that claimed the row
 * first wins, and a purge that comes later finds no row. Any failure leaves
 * the kept row as it was, so the restore can be tried again.
 */
export async function restoreDeletedDocument(
  userId: string,
  kind: string,
  documentId: string,
  now: Date = new Date()
): Promise<RestoreDeletedOutcome> {
  const handler = kinds.get(kind);
  const found = handler ? await findOwned(userId, kind, documentId, now) : null;
  if (!handler || !found) return { outcome: "not_found" };
  let payload: DeletedDocumentPayload | null;
  try {
    payload = await runDocumentTransaction(function* (tx) {
      const [row] = yield lockedRows(
        tx
          .select()
          .from(deletedDocuments)
          .where(and(eq(deletedDocuments.id, found.id), isNull(deletedDocuments.purging_since)))
          .limit(1)
      );
      if (!row) return null;
      const entry = row as typeof deletedDocuments.$inferSelect;
      if (kind !== "project" && entry.project_id !== null) {
        const refusal = yield* projectRefusal(tx, entry.project_id, userId);
        if (refusal !== null) throw new RestoreRefused(refusal);
      }
      const kept = JSON.parse(entry.payload) as DeletedDocumentPayload;
      yield* handler.restore(tx, kept);
      yield runOf(tx.delete(deletedDocuments).where(eq(deletedDocuments.id, entry.id)));
      return kept;
    });
  } catch (error) {
    if (error instanceof RestoreRefused) return { outcome: "failed", reason: error.message };
    return { outcome: "failed", reason: `A ${kind} with this id exists, or its rows could not be written` };
  }
  if (!payload) return { outcome: "not_found" };
  await handler.restored?.(payload);
  return { outcome: "restored" };
}

/**
 * Ends the restore period of the owner's deleted document now: the purge
 * runs for it at once and it cannot be restored afterwards. Returns false
 * when there is nothing to end or the purge failed. A failed purge stays
 * claimed and due, so the purge job finishes it.
 */
export async function endDeletedDocumentRestorePeriod(
  userId: string,
  kind: string,
  documentId: string,
  now: Date = new Date()
): Promise<boolean> {
  const row = await findOwned(userId, kind, documentId, now);
  if (!row) return false;
  return purgeRow(row, now);
}

/**
 * Deletes every kept document whose purge time has passed, oldest first, at
 * most `limit` per call. Returns how many it deleted. The daily job calls it
 * until it returns less than the limit. A purge that a crash or a failure
 * left claimed is due too, and resumes.
 */
export async function purgeDeletedDocuments(
  now: Date = new Date(),
  limit = 500
): Promise<number> {
  const db = getPortableDb();
  const due = await db
    .select()
    .from(deletedDocuments)
    .where(lte(deletedDocuments.purge_at, now.toISOString()))
    .orderBy(asc(deletedDocuments.purge_at))
    .limit(limit);
  let purged = 0;
  for (const row of due) {
    if (await purgeRow(row, now)) purged += 1;
  }
  return purged;
}

/**
 * Claims the kept row for its purge, unless a restore took it first. The
 * claim is one conditional update, so across servers a restore and a purge
 * never both proceed. The purge time moves to now, so a purge that did not
 * finish is due for the next run. A row already claimed is claimed again:
 * the kind's purge is written to resume.
 */
async function claimPurge(id: string, now: Date): Promise<boolean> {
  const stamp = now.toISOString();
  const claimed = await getPortableDb()
    .update(deletedDocuments)
    .set({ purging_since: stamp, purge_at: stamp })
    .where(and(eq(deletedDocuments.id, id), or(isNull(deletedDocuments.purging_since), lte(deletedDocuments.purging_since, stamp))))
    .returning({ id: deletedDocuments.id });
  return claimed.length > 0;
}

/** Claims the row, runs the kind's purge, then deletes the kept row. A failed purge keeps the claimed row for the next run. */
async function purgeRow(row: typeof deletedDocuments.$inferSelect, now: Date): Promise<boolean> {
  const purge = kinds.get(row.kind)?.purge;
  if (!(await claimPurge(row.id, now))) return false;
  if (purge) {
    try {
      await purge({
        userId: row.user_id,
        documentId: row.document_id,
        payload: JSON.parse(row.payload) as DeletedDocumentPayload
      });
    } catch (error) {
      log.warn("Could not purge a deleted document", {
        kind: row.kind,
        documentId: row.document_id,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  await getPortableDb().delete(deletedDocuments).where(eq(deletedDocuments.id, row.id));
  return true;
}

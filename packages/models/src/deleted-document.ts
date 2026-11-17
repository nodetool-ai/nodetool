/**
 * Deleted documents kept for a restore period
 * (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
 * storage", WP2.2, PRD D4).
 *
 * A model that deletes a document while retention is on first writes the
 * document's row and the rows that belong to it into
 * `nodetool_deleted_documents`, then deletes them as before, so the live
 * tables and their read paths are unchanged. The owner can restore the
 * document under the same id until its purge time. The purge job deletes the
 * kept rows after that, and "end the restore period now" purges one at once.
 *
 * Retention is off unless the host turns it on with
 * {@link setDocumentRetentionDays}. A server for many accounts turns it on;
 * a desktop server leaves it off and deletes at once, as before.
 */
import { and, asc, desc, eq, gt, lte, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createLogger } from "@nodetool-ai/config";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
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
}

/** How a kind puts a deleted document back. */
export interface DeletedDocumentKind {
  /**
   * Recreates the document from `payload`. Throws when it cannot, for
   * example because a document with the id exists again or its project is
   * gone. Nothing of the kept row is deleted in that case.
   */
  restore(payload: DeletedDocumentPayload): Promise<void>;
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
export async function readDependents(
  tables: DependentTable[]
): Promise<Record<string, RetainedRows>> {
  const db = getPortableDb();
  const result: Record<string, RetainedRows> = {};
  for (const { name, table, where } of tables) {
    result[name] = (await db.select().from(table).where(where)) as RetainedRows;
  }
  return result;
}

/** Inserts kept rows back into each dependent table that `tables` names. */
export async function insertDependents(
  tables: DependentTable[],
  dependents: Record<string, RetainedRows>
): Promise<void> {
  const db = getPortableDb();
  for (const { name, table } of tables) {
    const rows = dependents[name] ?? [];
    if (rows.length > 0) {
      await db.insert(table).values(rows as never);
    }
  }
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

/**
 * Keeps a document that is about to be deleted. Call it before the delete,
 * so a failure between the two leaves the live document and never loses it.
 * A document kept earlier under the same kind and id is replaced. Does
 * nothing while retention is off.
 */
export async function retainDeletedDocument(input: {
  kind: string;
  documentId: string;
  userId: string;
  projectId: string | null;
  name: string;
  payload: DeletedDocumentPayload;
  now?: Date;
}): Promise<void> {
  if (retentionDays === null) return;
  const now = input.now ?? new Date();
  const row = {
    id: createTimeOrderedUuid(),
    kind: input.kind,
    document_id: input.documentId,
    user_id: input.userId,
    project_id: input.projectId,
    name: input.name,
    payload: JSON.stringify(input.payload),
    deleted_at: now.toISOString(),
    purge_at: new Date(now.getTime() + retentionDays * DAY_MS).toISOString()
  };
  await getPortableDb()
    .insert(deletedDocuments)
    .values(row)
    .onConflictDoUpdate({
      target: [deletedDocuments.kind, deletedDocuments.document_id],
      set: {
        user_id: row.user_id,
        project_id: row.project_id,
        name: row.name,
        payload: row.payload,
        deleted_at: row.deleted_at,
        purge_at: row.purge_at
      }
    });
}

/** The owner's deleted documents that can still be restored, newest first. */
export async function listDeletedDocuments(
  userId: string,
  options: { projectId?: string; now?: Date } = {}
): Promise<DeletedDocumentEntry[]> {
  const now = (options.now ?? new Date()).toISOString();
  const conditions = [eq(deletedDocuments.user_id, userId), gt(deletedDocuments.purge_at, now)];
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
        gt(deletedDocuments.purge_at, now.toISOString())
      )
    )
    .limit(1);
  return row ?? null;
}

async function projectDeleted(projectId: string): Promise<boolean> {
  const [row] = await getPortableDb()
    .select({ deleted_at: projects.deleted_at })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row !== undefined && row.deleted_at !== null;
}

/**
 * Puts the owner's deleted document back under its id. A row past its purge
 * time, another user's row and an unknown kind are not found.
 */
export async function restoreDeletedDocument(
  userId: string,
  kind: string,
  documentId: string,
  now: Date = new Date()
): Promise<RestoreDeletedOutcome> {
  const handler = kinds.get(kind);
  const row = handler ? await findOwned(userId, kind, documentId, now) : null;
  if (!handler || !row) return { outcome: "not_found" };
  if (kind !== "project" && row.project_id !== null && (await projectDeleted(row.project_id))) {
    return { outcome: "failed", reason: "The document's project is deleted. Restore the project first." };
  }
  try {
    await handler.restore(JSON.parse(row.payload) as DeletedDocumentPayload);
  } catch (error) {
    return { outcome: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  await getPortableDb().delete(deletedDocuments).where(eq(deletedDocuments.id, row.id));
  return { outcome: "restored" };
}

/**
 * Ends the restore period of the owner's deleted document now: the purge
 * runs for it at once and it cannot be restored afterwards. Returns false
 * when there is nothing to end or the purge failed.
 */
export async function endDeletedDocumentRestorePeriod(
  userId: string,
  kind: string,
  documentId: string,
  now: Date = new Date()
): Promise<boolean> {
  const row = await findOwned(userId, kind, documentId, now);
  if (!row) return false;
  return purgeRow(row);
}

/**
 * Deletes every kept document whose purge time has passed, oldest first, at
 * most `limit` per call. Returns how many it deleted. The daily job calls it
 * until it returns less than the limit.
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
    if (await purgeRow(row)) purged += 1;
  }
  return purged;
}

/** Runs the kind's purge, then deletes the kept row. A failed purge keeps the row for the next run. */
async function purgeRow(row: typeof deletedDocuments.$inferSelect): Promise<boolean> {
  const purge = kinds.get(row.kind)?.purge;
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

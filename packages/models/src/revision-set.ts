/**
 * Rows of revision sets (docs/plans/native-cloud-sync/technical-design.md,
 * "Receiving: revision set, stage, check, apply", WP2.5). The receive service
 * in `@nodetool-ai/project-services/cloud-receive` decides what a set holds
 * and who may read it. These functions only store and read the rows.
 */
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { revisionSetEntries, revisionSetFiles, revisionSets } from "./schema/revision-sets.js";

export type RevisionSetRow = typeof revisionSets.$inferSelect;
export type RevisionSetEntryRow = typeof revisionSetEntries.$inferSelect;
export type RevisionSetFileRow = typeof revisionSetFiles.$inferSelect;

/** How long a set lives when its reader never releases it (Y1). */
export const REVISION_SET_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** One document of a set as the capture writes it. */
export interface RevisionSetEntryInput {
  kind: string;
  documentId: string;
  revisionId: string;
  fields: Record<string, unknown>;
  contentHash: string;
  files: ReadonlyArray<{ assetId: string; hash: string; size: number }>;
}

const IN_LIST_CHUNK = 400;

/** Creates an empty set for the reader. */
export async function createRevisionSet(input: {
  userId: string;
  projectId: string;
  now?: Date;
}): Promise<RevisionSetRow> {
  const now = input.now ?? new Date();
  const row: RevisionSetRow = {
    id: createTimeOrderedUuid(),
    user_id: input.userId,
    project_id: input.projectId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + REVISION_SET_LIFETIME_MS).toISOString()
  };
  await getPortableDb().insert(revisionSets).values(row);
  return row;
}

/** Adds one document and its files to a set. */
export async function addRevisionSetEntry(set: RevisionSetRow, entry: RevisionSetEntryInput): Promise<void> {
  const db = getPortableDb();
  await db.insert(revisionSetEntries).values({
    id: createTimeOrderedUuid(),
    set_id: set.id,
    user_id: set.user_id,
    project_id: set.project_id,
    document_kind: entry.kind,
    document_id: entry.documentId,
    revision_id: entry.revisionId,
    fields: JSON.stringify(entry.fields),
    content_hash: entry.contentHash
  });
  const files = entry.files.map((file) => ({
    id: createTimeOrderedUuid(),
    set_id: set.id,
    user_id: set.user_id,
    project_id: set.project_id,
    document_kind: entry.kind,
    document_id: entry.documentId,
    asset_id: file.assetId,
    hash: file.hash,
    size: file.size
  }));
  for (let i = 0; i < files.length; i += IN_LIST_CHUNK) {
    await db.insert(revisionSetFiles).values(files.slice(i, i + IN_LIST_CHUNK));
  }
}

/** The set, expired or not, or null. */
export async function getRevisionSet(id: string): Promise<RevisionSetRow | null> {
  const [row] = await getPortableDb().select().from(revisionSets).where(eq(revisionSets.id, id)).limit(1);
  return row ?? null;
}

/** The set when it exists and has not expired at `now`. */
export async function getLiveRevisionSet(id: string, now: Date = new Date()): Promise<RevisionSetRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(revisionSets)
    .where(and(eq(revisionSets.id, id), gt(revisionSets.expires_at, now.toISOString())))
    .limit(1);
  return row ?? null;
}

/** The entry of one document of a set, or null. */
export async function getRevisionSetEntry(
  setId: string,
  kind: string,
  documentId: string
): Promise<RevisionSetEntryRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(revisionSetEntries)
    .where(
      and(
        eq(revisionSetEntries.set_id, setId),
        eq(revisionSetEntries.document_kind, kind),
        eq(revisionSetEntries.document_id, documentId)
      )
    )
    .limit(1);
  return row ?? null;
}

/** The file rows of a set that name `hash`, one per document that needs it. */
export async function revisionSetFilesWithHash(setId: string, hash: string): Promise<RevisionSetFileRow[]> {
  return getPortableDb()
    .select()
    .from(revisionSetFiles)
    .where(and(eq(revisionSetFiles.set_id, setId), eq(revisionSetFiles.hash, hash)));
}

/** Deletes a set and its rows. Deleting a set that is gone does nothing. */
export async function deleteRevisionSet(id: string): Promise<void> {
  const db = getPortableDb();
  await db.delete(revisionSetFiles).where(eq(revisionSetFiles.set_id, id));
  await db.delete(revisionSetEntries).where(eq(revisionSetEntries.set_id, id));
  await db.delete(revisionSets).where(eq(revisionSets.id, id));
}

/** Deletes every set that expired at or before `now`, with its rows. Returns how many. */
export async function deleteExpiredRevisionSets(now: Date = new Date()): Promise<number> {
  const expired = await getPortableDb()
    .select({ id: revisionSets.id })
    .from(revisionSets)
    .where(lte(revisionSets.expires_at, now.toISOString()));
  for (const { id } of expired) await deleteRevisionSet(id);
  return expired.length;
}

/**
 * Whether a set that has not expired at `now` names `hash`. Such a hash is a
 * retention root of the blob store (Y1).
 */
export async function isHashInLiveRevisionSet(
  hash: string,
  now: Date = new Date(),
  db: ReturnType<typeof getPortableDb> = getPortableDb()
): Promise<boolean> {
  const sets = await db
    .selectDistinct({ setId: revisionSetFiles.set_id })
    .from(revisionSetFiles)
    .where(eq(revisionSetFiles.hash, hash));
  const ids = sets.map((row) => row.setId);
  for (let i = 0; i < ids.length; i += IN_LIST_CHUNK) {
    const [live] = await db
      .select({ id: revisionSets.id })
      .from(revisionSets)
      .where(and(inArray(revisionSets.id, ids.slice(i, i + IN_LIST_CHUNK)), gt(revisionSets.expires_at, now.toISOString())))
      .limit(1);
    if (live) return true;
  }
  return false;
}

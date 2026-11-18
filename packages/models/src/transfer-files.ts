/**
 * Placements and recovery copies of transfers into cloud projects
 * (docs/plans/native-cloud-sync/technical-design.md, "Blob store" and
 * "Operations of a transfer", WP2.4).
 *
 * A transfer commit cannot write files in the same transaction as its rows,
 * so it records each file it puts or deletes as a placement. The placement
 * task does the file work after the commit and deletes the row. A sweeper
 * repeats the placements that a crash or a failed write left behind.
 *
 * A recovery copy records content a transfer replaced, for 30 days, where no
 * version table keeps it.
 */
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDatabase, getPortableDb, inTransaction } from "./db.js";
import { projectBlobs } from "./schema/project-blobs.js";
import { recoveryCopies, transferPlacements, transferredConversations } from "./schema/transfer-files.js";

export type TransferPlacementRow = typeof transferPlacements.$inferSelect;
export type RecoveryCopyRow = typeof recoveryCopies.$inferSelect;

/** How long a recovery copy is kept. */
export const RECOVERY_COPY_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewTransferPlacement {
  projectId: string;
  userId: string;
  transferId: string;
  path: string;
  /** Null deletes the file at the path. */
  hash: string | null;
  assetId?: string | null;
}

/**
 * Serializes the file operations of transfers into one project until the
 * surrounding transaction ends. Two commits that read the same path or
 * asset base would otherwise both plan a replacement, and the later one
 * would overwrite the earlier one instead of keeping both. Call it inside
 * `withTransaction`, before reading what the cloud holds at any path.
 *
 * PostgreSQL takes a transaction-scoped advisory lock. SQLite has one
 * writer, so its commits are already serial.
 */
export async function lockProjectFiles(projectId: string): Promise<void> {
  if (!inTransaction()) throw new Error("lockProjectFiles needs an open transaction");
  const connection = getDatabase();
  if (connection.dialect !== "postgres") return;
  await connection.db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`transfer-files:${projectId}`}, 0))`
  );
}

/** Records files a transfer commit will place. Runs inside the commit. */
export async function addTransferPlacements(
  placements: readonly NewTransferPlacement[],
  now: Date = new Date()
): Promise<void> {
  if (placements.length === 0) return;
  await getPortableDb()
    .insert(transferPlacements)
    .values(
      placements.map((placement) => ({
        id: createTimeOrderedUuid(),
        project_id: placement.projectId,
        user_id: placement.userId,
        transfer_id: placement.transferId,
        path: placement.path,
        hash: placement.hash,
        asset_id: placement.assetId ?? null,
        created_at: now.toISOString()
      }))
    );
}

/** The placements of a project, oldest first. */
export async function listTransferPlacements(projectId: string): Promise<TransferPlacementRow[]> {
  return getPortableDb()
    .select()
    .from(transferPlacements)
    .where(eq(transferPlacements.project_id, projectId))
    .orderBy(asc(transferPlacements.created_at), asc(transferPlacements.id));
}

/** The paths of a project that a placement still has to write or delete. */
export async function pendingPlacementPaths(projectId: string): Promise<Set<string>> {
  const rows = await getPortableDb()
    .select({ path: transferPlacements.path })
    .from(transferPlacements)
    .where(eq(transferPlacements.project_id, projectId));
  return new Set(rows.map((row) => row.path));
}

/** The projects with a placement older than `before`, for the sweeper. */
export async function projectsWithStalePlacements(before: Date): Promise<string[]> {
  const rows = await getPortableDb()
    .selectDistinct({ project_id: transferPlacements.project_id })
    .from(transferPlacements)
    .where(lt(transferPlacements.created_at, before.toISOString()));
  return rows.map((row) => row.project_id);
}

/** Deletes a placement once its file work is done. */
export async function deleteTransferPlacement(id: string): Promise<void> {
  await getPortableDb().delete(transferPlacements).where(eq(transferPlacements.id, id));
}

export interface NewRecoveryCopy {
  projectId: string;
  userId: string;
  transferId: string;
  operation: "put_workspace_file" | "put_asset_file" | "delete_workspace_file";
  workspacePath: string;
  assetId?: string | null;
  blobHash: string;
  size: number;
}

/**
 * Records replaced bytes for 30 days. The bytes are already in the blob
 * store under `blobHash`, and a committed `project_blobs` row for the
 * transfer keeps them from the blob cleanup.
 */
export async function recordRecoveryCopy(copy: NewRecoveryCopy, now: Date = new Date()): Promise<void> {
  const db = getPortableDb();
  await db
    .insert(projectBlobs)
    .values({
      id: createTimeOrderedUuid(),
      project_id: copy.projectId,
      user_id: copy.userId,
      hash: copy.blobHash,
      size: copy.size,
      transfer_id: copy.transferId,
      committed_at: now.toISOString(),
      created_at: now.toISOString()
    })
    .onConflictDoNothing({
      target: [projectBlobs.project_id, projectBlobs.hash, projectBlobs.transfer_id]
    });
  await db.insert(recoveryCopies).values({
    id: createTimeOrderedUuid(),
    project_id: copy.projectId,
    user_id: copy.userId,
    document_kind: null,
    document_id: null,
    workspace_path: copy.workspacePath,
    asset_id: copy.assetId ?? null,
    blob_hash: copy.blobHash,
    size: copy.size,
    operation: copy.operation,
    transfer_id: copy.transferId,
    created_at: now.toISOString(),
    purge_at: new Date(now.getTime() + RECOVERY_COPY_LIFETIME_MS).toISOString()
  });
}

/** The recovery copies of a project, newest first. */
export async function listRecoveryCopies(projectId: string): Promise<RecoveryCopyRow[]> {
  const rows = await getPortableDb()
    .select()
    .from(recoveryCopies)
    .where(eq(recoveryCopies.project_id, projectId))
    .orderBy(asc(recoveryCopies.created_at), asc(recoveryCopies.id));
  return rows.reverse();
}

/**
 * The cloud thread a transfer made from `sourceThreadId` in this project,
 * or null when none did.
 */
export async function findTransferredConversation(
  projectId: string,
  userId: string,
  sourceThreadId: string
): Promise<string | null> {
  const [row] = await getPortableDb()
    .select({ thread_id: transferredConversations.thread_id })
    .from(transferredConversations)
    .where(
      and(
        eq(transferredConversations.project_id, projectId),
        eq(transferredConversations.user_id, userId),
        eq(transferredConversations.source_thread_id, sourceThreadId)
      )
    )
    .limit(1);
  return row?.thread_id ?? null;
}

/** Records the cloud thread a transfer made from a conversation of the sending device. */
export async function recordTransferredConversation(
  entry: { projectId: string; userId: string; sourceThreadId: string; threadId: string; transferId: string },
  now: Date = new Date()
): Promise<void> {
  await getPortableDb().insert(transferredConversations).values({
    id: createTimeOrderedUuid(),
    project_id: entry.projectId,
    user_id: entry.userId,
    source_thread_id: entry.sourceThreadId,
    thread_id: entry.threadId,
    transfer_id: entry.transferId,
    created_at: now.toISOString()
  });
}

/**
 * Rows of the blob store (docs/plans/native-cloud-sync/technical-design.md,
 * "Blob store", WP2.1). The bytes live in the storage adapter under
 * `blobs/<hash>`, written by `@nodetool-ai/asset-services/blob-store`. A row
 * records that a project holds a hash. A staged row belongs to the transfer
 * that staged it until the commit sets `committed_at`.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { blobDeletions, projectBlobs } from "./schema/project-blobs.js";

export type ProjectBlobRow = typeof projectBlobs.$inferSelect;

/** Lowercase hex SHA-256, the form `nodetool_assets.content_hash` holds. */
export const BLOB_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** How long a staged row waits for its commit before the cleanup deletes it. */
export const STAGED_BLOB_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Records that `transferId` staged `hash` for the project. Staging the same
 * hash again in the same transfer keeps the first row.
 */
export async function stageProjectBlob(input: {
  projectId: string;
  userId: string;
  hash: string;
  size: number;
  transferId: string;
  now?: Date;
}): Promise<void> {
  await getPortableDb()
    .insert(projectBlobs)
    .values({
      id: createTimeOrderedUuid(),
      project_id: input.projectId,
      user_id: input.userId,
      hash: input.hash,
      size: input.size,
      transfer_id: input.transferId,
      committed_at: null,
      created_at: (input.now ?? new Date()).toISOString()
    })
    .onConflictDoNothing({
      target: [projectBlobs.project_id, projectBlobs.hash, projectBlobs.transfer_id]
    });
}

/**
 * Commits every row the transfer staged for the project. Returns how many
 * rows it committed. The transfer commit calls it inside its own write.
 */
export async function commitProjectBlobs(
  projectId: string,
  transferId: string,
  now: Date = new Date()
): Promise<number> {
  const rows = await getPortableDb()
    .update(projectBlobs)
    .set({ committed_at: now.toISOString() })
    .where(
      and(
        eq(projectBlobs.project_id, projectId),
        eq(projectBlobs.transfer_id, transferId),
        isNull(projectBlobs.committed_at)
      )
    )
    .returning({ id: projectBlobs.id });
  return rows.length;
}

/**
 * The hashes among `hashes` for which the owner already has a committed row
 * in any of their projects. Only these may skip the upload: across owners
 * the answer would tell anyone whether a file exists on the server.
 */
export async function committedHashesOfOwner(
  userId: string,
  hashes: readonly string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += 400) {
    const rows = await getPortableDb()
      .selectDistinct({ hash: projectBlobs.hash })
      .from(projectBlobs)
      .where(
        and(
          eq(projectBlobs.user_id, userId),
          inArray(projectBlobs.hash, unique.slice(i, i + 400)),
          isNotNull(projectBlobs.committed_at)
        )
      );
    for (const row of rows) found.add(row.hash);
  }
  return found;
}

/**
 * The row through which `hash` may be read in the project: a committed row,
 * or with `transferId` that transfer's own staged row. Null when there is
 * none (SR20). The caller checks that the reader may open the project.
 */
export async function readableProjectBlob(input: {
  projectId: string;
  hash: string;
  transferId?: string;
}): Promise<ProjectBlobRow | null> {
  const rows = await getPortableDb()
    .select()
    .from(projectBlobs)
    .where(and(eq(projectBlobs.project_id, input.projectId), eq(projectBlobs.hash, input.hash)));
  return (
    rows.find((row) => row.committed_at !== null) ??
    rows.find((row) => input.transferId !== undefined && row.transfer_id === input.transferId) ??
    null
  );
}

/**
 * The size the owner's committed rows record for `hash`, or null when the
 * owner has none. A reuse stages this size, never one the client declares.
 */
export async function committedSizeOfOwner(userId: string, hash: string): Promise<number | null> {
  const [row] = await getPortableDb()
    .select({ size: projectBlobs.size })
    .from(projectBlobs)
    .where(and(eq(projectBlobs.user_id, userId), eq(projectBlobs.hash, hash), isNotNull(projectBlobs.committed_at)))
    .limit(1);
  return row ? Number(row.size) : null;
}

/** How long a deletion claim holds before another cleanup may take it over. */
export const BLOB_DELETION_CLAIM_MS = 5 * 60 * 1000;

/**
 * Claims the deletion of the object of `hash` for one cleanup. False when
 * another cleanup holds a claim younger than {@link BLOB_DELETION_CLAIM_MS}.
 * The claim is an insert into a table keyed by hash, so across servers one
 * cleanup wins.
 */
export async function claimBlobDeletion(hash: string, now: Date = new Date()): Promise<boolean> {
  const db = getPortableDb();
  // A claim a stopped cleanup left is removed first, then raced for.
  const staleBefore = new Date(now.getTime() - BLOB_DELETION_CLAIM_MS).toISOString();
  await db.delete(blobDeletions).where(and(eq(blobDeletions.hash, hash), lt(blobDeletions.claimed_at, staleBefore)));
  const claimed = await db
    .insert(blobDeletions)
    .values({ hash, claimed_at: now.toISOString() })
    .onConflictDoNothing()
    .returning({ hash: blobDeletions.hash });
  return claimed.length > 0;
}

/** Ends the cleanup's claim on `hash`, after it deleted the object or skipped it. */
export async function releaseBlobDeletion(hash: string): Promise<void> {
  await getPortableDb().delete(blobDeletions).where(eq(blobDeletions.hash, hash));
}

/**
 * Whether a cleanup may be deleting the object of `hash` now: a claim
 * younger than {@link BLOB_DELETION_CLAIM_MS} exists.
 */
export async function isBlobDeletionClaimed(hash: string, now: Date = new Date()): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - BLOB_DELETION_CLAIM_MS).toISOString();
  const [row] = await getPortableDb()
    .select({ hash: blobDeletions.hash })
    .from(blobDeletions)
    .where(and(eq(blobDeletions.hash, hash), gte(blobDeletions.claimed_at, staleBefore)))
    .limit(1);
  return row !== undefined;
}

/** Whether any row, staged or committed, names the hash. */
export async function isBlobHashNamed(hash: string): Promise<boolean> {
  const [row] = await getPortableDb()
    .select({ id: projectBlobs.id })
    .from(projectBlobs)
    .where(eq(projectBlobs.hash, hash))
    .limit(1);
  return row !== undefined;
}

/** Deletes staged rows older than the staged lifetime. Returns how many. */
export async function deleteExpiredStagedBlobs(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - STAGED_BLOB_LIFETIME_MS).toISOString();
  const rows = await getPortableDb()
    .delete(projectBlobs)
    .where(and(isNull(projectBlobs.committed_at), lt(projectBlobs.created_at, before)))
    .returning({ id: projectBlobs.id });
  return rows.length;
}

/**
 * Deletes the rows a cancelled transfer staged. Committed rows stay.
 * Returns how many it deleted.
 */
export async function deleteStagedBlobsOfTransfer(transferId: string): Promise<number> {
  const rows = await getPortableDb()
    .delete(projectBlobs)
    .where(and(eq(projectBlobs.transfer_id, transferId), isNull(projectBlobs.committed_at)))
    .returning({ id: projectBlobs.id });
  return rows.length;
}

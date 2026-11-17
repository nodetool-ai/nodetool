/**
 * The blob store of cloud projects
 * (docs/plans/native-cloud-sync/technical-design.md, "Blob store", WP2.1).
 *
 * Bytes live once under `blobs/<sha256>` in a storage adapter, and rows in
 * `project_blobs` record which project holds which hash. A transfer stages a
 * file here before its commit. The server computes the hash of what it
 * received and refuses a mismatch, so a row never names bytes other than its
 * hash. The upload of a hash may be skipped only when the same owner
 * already has a committed row for it: across owners the answer would let
 * anyone test whether a file exists on the server.
 *
 * The row is written before the object, so the cleanup, which deletes
 * objects that no row names, never removes an object a stage is writing.
 */
import { createHash } from "node:crypto";
import {
  BLOB_HASH_PATTERN,
  committedHashesOfOwner,
  deleteExpiredStagedBlobs,
  isBlobHashNamed,
  readableProjectBlob,
  stageProjectBlob
} from "@nodetool-ai/models";
import type { StorageAdapter } from "@nodetool-ai/storage";

/** The storage key prefix of the blob store. */
export const BLOB_PREFIX = "blobs/";

/**
 * An object younger than this is never deleted by the cleanup, so a stage
 * that wrote its row and object around a cleanup pass keeps its object.
 */
export const BLOB_CLEANUP_GRACE_MS = 60 * 60 * 1000;

/** The storage key of the object holding the bytes with this hash. */
export function blobKey(hash: string): string {
  return `${BLOB_PREFIX}${hash}`;
}

/** The lowercase hex SHA-256 of `bytes`. */
export function blobHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Why a stage was refused. `code` is the wire code of the transfer API. */
export class BlobStageError extends Error {
  constructor(
    readonly code: "HASH_MISMATCH" | "INVALID_HASH",
    message: string,
    /** For a mismatch: the hash of the bytes the server received. */
    readonly receivedHash?: string
  ) {
    super(message);
    this.name = "BlobStageError";
  }
}

export interface StageBlobInput {
  projectId: string;
  /** The project's owner. */
  userId: string;
  transferId: string;
  /** The hash the client declared. */
  hash: string;
  /** The size the client declared. */
  size: number;
  bytes: Uint8Array;
}

/**
 * Stages the bytes for the transfer. Answers `already_present` when the
 * store held the object already, `stored` when it wrote it. Throws
 * {@link BlobStageError} with `HASH_MISMATCH` when the bytes are not what the
 * client declared, and writes nothing in that case.
 */
export async function stageBlob(
  adapter: StorageAdapter,
  input: StageBlobInput
): Promise<"stored" | "already_present"> {
  if (!BLOB_HASH_PATTERN.test(input.hash)) {
    throw new BlobStageError("INVALID_HASH", "A blob hash is 64 lowercase hex characters");
  }
  const received = blobHash(input.bytes);
  if (received !== input.hash || input.bytes.byteLength !== input.size) {
    throw new BlobStageError(
      "HASH_MISMATCH",
      "The received bytes do not have the declared hash and size",
      received
    );
  }
  await stageProjectBlob({
    projectId: input.projectId,
    userId: input.userId,
    hash: input.hash,
    size: input.size,
    transferId: input.transferId
  });
  const uri = adapter.uriForKey(blobKey(input.hash));
  if (adapter.storeIfAbsent) {
    const stored = await adapter.storeIfAbsent(blobKey(input.hash), input.bytes);
    return stored === null ? "already_present" : "stored";
  }
  // Two writers of one hash write the same bytes, so a lost race is harmless.
  if (await adapter.exists(uri)) return "already_present";
  await adapter.store(blobKey(input.hash), input.bytes);
  return "stored";
}

/**
 * Stages a hash the owner already holds, without its bytes. Returns false
 * when the owner has no committed row for it or the object is gone, in which
 * case the client must send the bytes.
 */
export async function stageKnownBlob(
  adapter: StorageAdapter,
  input: Omit<StageBlobInput, "bytes">
): Promise<boolean> {
  if (!BLOB_HASH_PATTERN.test(input.hash)) return false;
  const held = await committedHashesOfOwner(input.userId, [input.hash]);
  if (!held.has(input.hash)) return false;
  // The owner's committed row keeps the object from the cleanup, so it is
  // still there after the row below is written.
  if (!(await adapter.exists(adapter.uriForKey(blobKey(input.hash))))) return false;
  await stageProjectBlob({
    projectId: input.projectId,
    userId: input.userId,
    hash: input.hash,
    size: input.size,
    transferId: input.transferId
  });
  return true;
}

/**
 * The hashes among `hashes` whose bytes the client must send: every hash for
 * which the owner has no committed row, even when another owner's row names
 * it, and every hash whose object is missing.
 */
export async function hashesToSend(
  adapter: StorageAdapter,
  userId: string,
  hashes: readonly string[]
): Promise<string[]> {
  const held = await committedHashesOfOwner(userId, hashes);
  const needed: string[] = [];
  for (const hash of new Set(hashes)) {
    if (!held.has(hash) || !(await adapter.exists(adapter.uriForKey(blobKey(hash))))) {
      needed.push(hash);
    }
  }
  return needed;
}

/**
 * The bytes of `hash` as the project holds them: through a committed row, or
 * with `transferId` through that transfer's staged row. Null when no such row
 * exists or the object is gone. The caller checks that the reader may open
 * the project.
 */
export async function readBlob(
  adapter: StorageAdapter,
  input: { projectId: string; hash: string; transferId?: string }
): Promise<Uint8Array | null> {
  if (!BLOB_HASH_PATTERN.test(input.hash)) return null;
  const row = await readableProjectBlob(input);
  if (!row) return null;
  return adapter.retrieve(adapter.uriForKey(blobKey(input.hash)));
}

export interface BlobCleanupResult {
  stagedRowsDeleted: number;
  objectsDeleted: number;
}

/**
 * The daily cleanup: deletes staged rows older than seven days, then every
 * object under `blobs/` that no row names and that is older than
 * {@link BLOB_CLEANUP_GRACE_MS}.
 */
export async function cleanupBlobs(
  adapter: StorageAdapter,
  now: Date = new Date()
): Promise<BlobCleanupResult> {
  const stagedRowsDeleted = await deleteExpiredStagedBlobs(now);
  let objectsDeleted = 0;
  const { entries } = await adapter.list(BLOB_PREFIX);
  for (const entry of entries) {
    const hash = entry.key.slice(entry.key.lastIndexOf("/") + 1);
    if (!BLOB_HASH_PATTERN.test(hash)) continue;
    if (await isBlobHashNamed(hash)) continue;
    if (now.getTime() - entry.modifiedAt < BLOB_CLEANUP_GRACE_MS) continue;
    // A stage may have named the hash since the check above.
    if (await isBlobHashNamed(hash)) continue;
    if (await adapter.delete(entry.uri)) objectsDeleted += 1;
  }
  return { stagedRowsDeleted, objectsDeleted };
}

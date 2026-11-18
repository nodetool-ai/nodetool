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
 * Across servers the cleanup and a stage meet at a lock per hash: the
 * cleanup looks for rows and deletes the object under it, and a stage
 * writes its row under it, so a deletion that found no row ends before the
 * stage writes its bytes (F9, review F27).
 *
 * An object is written under a staging name and given its key in one step,
 * so a key never holds part of the bytes. An object a writer without that
 * step left short is replaced when the hash is staged again (F10).
 */
import { createHash } from "node:crypto";
import {
  BLOB_HASH_PATTERN,
  committedHashesOfOwner,
  committedSizeOfOwner,
  deleteExpiredStagedBlobs,
  deleteUnnamedBlob,
  isBlobHashNamed,
  readableProjectBlob,
  stageProjectBlob
} from "@nodetool-ai/models";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { pausePoint } from "@nodetool-ai/config/pause-points";

/** The storage key prefix of the blob store. */
export const BLOB_PREFIX = "blobs/";

/**
 * An object younger than this is never deleted by the cleanup, so a stage
 * that wrote its row and object around a cleanup pass keeps its object.
 */
export const BLOB_CLEANUP_GRACE_MS = 60 * 60 * 1000;

/** A staging file a writer left beside its key: `<hash>.<transfer>.staging`. */
const STAGING_NAME = /^[0-9a-f]{64}\.[A-Za-z0-9_-]+\.staging$/;

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
  // The row is written under the hash's lock, so a deletion of the object
  // that started before has ended, and none starts now.
  const key = blobKey(input.hash);
  const uri = adapter.uriForKey(key);
  if (adapter.storeIfAbsent) {
    const options = { stagingName: stagingName(input.hash, input.transferId) };
    if ((await adapter.storeIfAbsent(key, input.bytes, undefined, options)) !== null) return "stored";
    if (await isWhole(adapter, uri, input.size)) return "already_present";
    // A short object is replaced. A writer racing this one writes the same
    // bytes, and the one that loses the second create finds them whole.
    await adapter.delete(uri);
    return (await adapter.storeIfAbsent(key, input.bytes, undefined, options)) === null
      ? "already_present"
      : "stored";
  }
  // Two writers of one hash write the same bytes, so a lost race is harmless.
  if (await isWhole(adapter, uri, input.size)) return "already_present";
  await adapter.store(key, input.bytes);
  return "stored";
}

/**
 * Stages a hash the owner already holds, without its bytes. The row records
 * the size of the owner's committed row: a declared size that differs is
 * refused (F11). Returns false when the owner has no committed row for the
 * hash with that size, or the object is gone or short, in which case the
 * client must send the bytes.
 */
export async function stageKnownBlob(
  adapter: StorageAdapter,
  input: Omit<StageBlobInput, "bytes">
): Promise<boolean> {
  if (!BLOB_HASH_PATTERN.test(input.hash)) return false;
  const size = await committedSizeOfOwner(input.userId, input.hash);
  if (size === null || size !== input.size) return false;
  await stageProjectBlob({
    projectId: input.projectId,
    userId: input.userId,
    hash: input.hash,
    size,
    transferId: input.transferId
  });
  // The row now keeps the object from any cleanup. One that ran before may
  // have deleted it, which the check below finds.
  return isWhole(adapter, adapter.uriForKey(blobKey(input.hash)), size);
}

/** The staging name of one transfer's write of `hash`. */
function stagingName(hash: string, transferId: string): string {
  return `${hash}.${transferId.replace(/[^A-Za-z0-9_-]/g, "_")}.staging`;
}

/** Whether the object under `uri` exists with `size` bytes. */
async function isWhole(adapter: StorageAdapter, uri: string, size: number): Promise<boolean> {
  const stat = adapter.statStrict ? await adapter.statStrict(uri) : await adapter.stat(uri);
  return stat !== null && stat.size === size;
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

/** Deletes one unnamed object. A test pauses here to race a stage (review F27). */
async function removeBlob(adapter: StorageAdapter, uri: string): Promise<boolean> {
  await pausePoint("blob.cleanup.deleting");
  return adapter.delete(uri);
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
    const name = entry.key.slice(entry.key.lastIndexOf("/") + 1);
    const old = now.getTime() - entry.modifiedAt >= BLOB_CLEANUP_GRACE_MS;
    if (STAGING_NAME.test(name)) {
      // What a writer that stopped left beside its key.
      if (old) await adapter.delete(entry.uri);
      continue;
    }
    if (!BLOB_HASH_PATTERN.test(name) || !old) continue;
    if (await isBlobHashNamed(name)) continue;
    // Checked again under the hash's lock, which a stage takes to write its row.
    if (await deleteUnnamedBlob(name, () => removeBlob(adapter, entry.uri))) objectsDeleted += 1;
  }
  return { stagedRowsDeleted, objectsDeleted };
}

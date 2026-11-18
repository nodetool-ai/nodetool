/**
 * The blob store (WP2.1): the server's hash check, the presence check scoped
 * to one owner, the read rule and the cleanup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitProjectBlobs, initTestDb } from "@nodetool-ai/models";
import { PauseGate } from "@nodetool-ai/config/testing/pause-harness";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  BLOB_CLEANUP_GRACE_MS,
  BlobStageError,
  blobHash,
  blobKey,
  cleanupBlobs,
  hashesToSend,
  readBlob,
  stageBlob,
  stageKnownBlob
} from "../src/blob-store.js";

const BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const HASH = blobHash(BYTES);
const DAY = 24 * 60 * 60 * 1000;

let storage: InMemoryStorageAdapter;
let gate: PauseGate | null = null;
beforeEach(() => {
  initTestDb();
  storage = new InMemoryStorageAdapter();
});
afterEach(() => {
  gate?.uninstall();
  gate = null;
});

function stage(transferId: string, overrides: Partial<Parameters<typeof stageBlob>[1]> = {}) {
  return stageBlob(storage, {
    projectId: "p1",
    userId: "u1",
    transferId,
    hash: HASH,
    size: BYTES.byteLength,
    bytes: BYTES,
    ...overrides
  });
}

describe("blob store", () => {
  it("refuses bytes that do not match the declared hash and writes nothing", async () => {
    const other = new Uint8Array([9, 9, 9, 9, 9]);
    const error = await stage("t1", { bytes: other }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BlobStageError);
    expect((error as BlobStageError).code).toBe("HASH_MISMATCH");
    expect((error as BlobStageError).receivedHash).toBe(blobHash(other));
    expect(await storage.exists(storage.uriForKey(blobKey(HASH)))).toBe(false);
    expect(await readBlob(storage, { projectId: "p1", hash: HASH, transferId: "t1" })).toBeNull();

    await expect(stage("t1", { size: 4 })).rejects.toMatchObject({ code: "HASH_MISMATCH" });
    await expect(stage("t1", { hash: "ABC" })).rejects.toMatchObject({ code: "INVALID_HASH" });
  });

  it("stores the bytes once and reads them only through the transfer until the commit", async () => {
    expect(await stage("t1")).toBe("stored");
    expect(await stage("t2", { projectId: "p2" })).toBe("already_present");

    expect(await readBlob(storage, { projectId: "p1", hash: HASH })).toBeNull();
    expect(await readBlob(storage, { projectId: "p1", hash: HASH, transferId: "t1" })).toEqual(BYTES);
    await commitProjectBlobs("p1", "t1");
    expect(await readBlob(storage, { projectId: "p1", hash: HASH })).toEqual(BYTES);
    expect(await readBlob(storage, { projectId: "p2", hash: HASH })).toBeNull();
  });

  it("skips an upload only for the owner who already committed the hash", async () => {
    await stage("t1");
    // Staged is not enough.
    expect(await hashesToSend(storage, "u1", [HASH])).toEqual([HASH]);
    await commitProjectBlobs("p1", "t1");
    expect(await hashesToSend(storage, "u1", [HASH, HASH])).toEqual([]);
    // Another owner must send the bytes even though the store holds them.
    expect(await hashesToSend(storage, "u2", [HASH])).toEqual([HASH]);
    expect(
      await stageKnownBlob(storage, { projectId: "q1", userId: "u2", transferId: "t9", hash: HASH, size: 5 })
    ).toBe(false);
    expect(
      await stageKnownBlob(storage, { projectId: "p3", userId: "u1", transferId: "t3", hash: HASH, size: 5 })
    ).toBe(true);
    expect(await readBlob(storage, { projectId: "p3", hash: HASH, transferId: "t3" })).toEqual(BYTES);
  });

  it("asks for the bytes again when the object is gone", async () => {
    await stage("t1");
    await commitProjectBlobs("p1", "t1");
    await storage.delete(storage.uriForKey(blobKey(HASH)));
    expect(await hashesToSend(storage, "u1", [HASH])).toEqual([HASH]);
    expect(
      await stageKnownBlob(storage, { projectId: "p3", userId: "u1", transferId: "t3", hash: HASH, size: 5 })
    ).toBe(false);
  });

  it("deletes expired staged rows, then objects no row names, and keeps committed ones", async () => {
    const committedBytes = new Uint8Array([7, 7, 7]);
    const committedHash = blobHash(committedBytes);
    await stage("t1");
    await stageBlob(storage, {
      projectId: "p1",
      userId: "u1",
      transferId: "t2",
      hash: committedHash,
      size: 3,
      bytes: committedBytes
    });
    await commitProjectBlobs("p1", "t2");

    // Within seven days the staged row keeps its object.
    expect(await cleanupBlobs(storage, new Date(Date.now() + 6 * DAY))).toEqual({
      stagedRowsDeleted: 0,
      objectsDeleted: 0
    });
    expect(await cleanupBlobs(storage, new Date(Date.now() + 8 * DAY))).toEqual({
      stagedRowsDeleted: 1,
      objectsDeleted: 1
    });
    expect(await storage.exists(storage.uriForKey(blobKey(HASH)))).toBe(false);
    expect(await readBlob(storage, { projectId: "p1", hash: committedHash })).toEqual(committedBytes);
  });

  it("writes the bytes after a cleanup deleting the hash ends, however long it pauses (F9, review F27)", async () => {
    gate = new PauseGate(["blob.cleanup.deleting"]).install();
    await storage.store(blobKey(HASH), BYTES);
    // The cleanup found no row and is about to delete the object. It holds
    // there far longer than any claim lifetime.
    const cleaned = cleanupBlobs(storage, new Date(Date.now() + 2 * BLOB_CLEANUP_GRACE_MS));
    await gate.waitFor("blob.cleanup.deleting");
    let stageEnded = false;
    const staged = stage("t1").finally(() => {
      stageEnded = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stageEnded).toBe(false);
    gate.release("blob.cleanup.deleting");
    expect((await cleaned).objectsDeleted).toBe(1);
    expect(await staged).toBe("stored");
    expect(await readBlob(storage, { projectId: "p1", hash: HASH, transferId: "t1" })).toEqual(BYTES);
    // A cleanup now finds the row and keeps the object.
    expect((await cleanupBlobs(storage, new Date(Date.now() + 2 * BLOB_CLEANUP_GRACE_MS))).objectsDeleted).toBe(0);
  });

  it("writes through a staging name and replaces a short object (F10)", async () => {
    await storage.store(blobKey(HASH), BYTES.slice(0, 2));
    const create = vi.spyOn(storage, "storeIfAbsent");
    expect(await stage("t1")).toBe("stored");
    expect(create.mock.calls[0]?.[3]).toEqual({ stagingName: `${HASH}.t1.staging` });
    expect(await readBlob(storage, { projectId: "p1", hash: HASH, transferId: "t1" })).toEqual(BYTES);
    // A whole object is kept.
    expect(await stage("t2")).toBe("already_present");
  });

  it("removes a staging file a stopped writer left", async () => {
    await storage.store(`blobs/${HASH}.t1.staging`, BYTES.slice(0, 2));
    await cleanupBlobs(storage, new Date(Date.now() + 2 * BLOB_CLEANUP_GRACE_MS));
    expect(await storage.exists(storage.uriForKey(`blobs/${HASH}.t1.staging`))).toBe(false);
  });

  it("refuses a reuse whose declared size differs from the committed one (F11)", async () => {
    await stage("t1");
    await commitProjectBlobs("p1", "t1");
    const reuse = (size: number) =>
      stageKnownBlob(storage, { projectId: "p2", userId: "u1", transferId: "t2", hash: HASH, size });
    expect(await reuse(4)).toBe(false);
    expect(await reuse(BYTES.byteLength)).toBe(true);
  });

  it("keeps a young object that no row names yet", async () => {
    await storage.store(blobKey(HASH), BYTES);
    expect((await cleanupBlobs(storage, new Date(Date.now() + BLOB_CLEANUP_GRACE_MS / 2))).objectsDeleted).toBe(0);
    expect((await cleanupBlobs(storage, new Date(Date.now() + 2 * BLOB_CLEANUP_GRACE_MS))).objectsDeleted).toBe(1);
  });
});

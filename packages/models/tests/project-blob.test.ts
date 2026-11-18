/**
 * Blob store rows (WP2.1): staging, commit, the owner-scoped presence check,
 * the read rule and the cleanup of expired staged rows.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import {
  STAGED_BLOB_LIFETIME_MS,
  commitProjectBlobs,
  committedHashesOfOwner,
  deleteExpiredStagedBlobs,
  deleteStagedBlobsOfTransfer,
  isBlobHashNamed,
  readableProjectBlob,
  stageProjectBlob
} from "../src/project-blob.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("project blobs", () => {
  beforeEach(() => initTestDb());

  it("keeps a staged row to its transfer until the commit", async () => {
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_A, size: 5, transferId: "t1" });
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_A, size: 5, transferId: "t1" });

    expect(await readableProjectBlob({ projectId: "p1", hash: HASH_A })).toBeNull();
    expect(await readableProjectBlob({ projectId: "p1", hash: HASH_A, transferId: "t2" })).toBeNull();
    expect((await readableProjectBlob({ projectId: "p1", hash: HASH_A, transferId: "t1" }))?.size).toBe(5);
    expect(await committedHashesOfOwner("u1", [HASH_A])).toEqual(new Set());

    expect(await commitProjectBlobs("p1", "t1")).toBe(1);
    expect(await commitProjectBlobs("p1", "t1")).toBe(0);
    expect((await readableProjectBlob({ projectId: "p1", hash: HASH_A }))?.committed_at).not.toBeNull();
    // Another project of the same owner does not read through p1's row.
    expect(await readableProjectBlob({ projectId: "p2", hash: HASH_A })).toBeNull();
  });

  it("answers presence only for the owner's committed rows", async () => {
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_A, size: 5, transferId: "t1" });
    await commitProjectBlobs("p1", "t1");
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_B, size: 5, transferId: "t2" });

    expect(await committedHashesOfOwner("u1", [HASH_A, HASH_B])).toEqual(new Set([HASH_A]));
    expect(await committedHashesOfOwner("u2", [HASH_A, HASH_B])).toEqual(new Set());
  });

  it("stores a size beyond 32 bits", async () => {
    const size = 5 * 1024 ** 3;
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_A, size, transferId: "t1" });
    expect((await readableProjectBlob({ projectId: "p1", hash: HASH_A, transferId: "t1" }))?.size).toBe(size);
  });

  it("deletes staged rows after seven days and never a committed one", async () => {
    const then = new Date("2026-11-01T00:00:00.000Z");
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_A, size: 1, transferId: "t1", now: then });
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_B, size: 1, transferId: "t2", now: then });
    await commitProjectBlobs("p1", "t2", then);

    const almost = new Date(then.getTime() + STAGED_BLOB_LIFETIME_MS - 1000);
    expect(await deleteExpiredStagedBlobs(almost)).toBe(0);
    const after = new Date(then.getTime() + STAGED_BLOB_LIFETIME_MS + 1000);
    expect(await deleteExpiredStagedBlobs(after)).toBe(1);
    expect(await isBlobHashNamed(HASH_A)).toBe(false);
    expect(await isBlobHashNamed(HASH_B)).toBe(true);
  });

  it("drops the staged rows of a cancelled transfer", async () => {
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_A, size: 1, transferId: "t1" });
    await stageProjectBlob({ projectId: "p1", userId: "u1", hash: HASH_B, size: 1, transferId: "t1" });
    await commitProjectBlobs("p1", "t1");
    await stageProjectBlob({ projectId: "p2", userId: "u1", hash: HASH_A, size: 1, transferId: "t3" });
    expect(await deleteStagedBlobsOfTransfer("t3")).toBe(1);
    expect(await deleteStagedBlobsOfTransfer("t1")).toBe(0);
  });
});

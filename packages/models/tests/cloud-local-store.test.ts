import { beforeEach, describe, expect, it } from "vitest";
import {
  CloudLocalStore,
  type CloudLocalScope
} from "../src/cloud-local-store.js";
import { getRawDb, initTestDb } from "../src/db.js";

const A: CloudLocalScope = {
  userId: "1",
  serverKey: "a1b2c3d4e5f60718",
  accountId: "account-a"
};
const B: CloudLocalScope = { ...A, accountId: "account-b" };
const OTHER_SERVER: CloudLocalScope = { ...A, serverKey: "ffffffffffffffff" };
const DOC = { kind: "workflow", documentId: "doc-1" };
const BASE = { updatedAt: "2026-11-16T10:00:00.000Z", contentHash: "hash-0" };
const OPTIONS = {
  allow_history: false,
  allow_download: false,
  allow_duplicate: false
};

describe("CloudLocalStore", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("stores a draft and counts its revisions", async () => {
    expect(await CloudLocalStore.putDraft(A, DOC, BASE, '{"v":1}')).toBe(1);
    expect(await CloudLocalStore.putDraft(A, DOC, BASE, '{"v":2}')).toBe(2);
    const row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.draft).toBe('{"v":2}');
    expect(row?.state).toBe("waiting");
    expect(row?.revision).toBe(2);
  });

  it("returns the connection to synchronous NORMAL after a draft write", async () => {
    await CloudLocalStore.putDraft(A, DOC, BASE, "{}");
    // 1 is NORMAL, 2 is FULL.
    expect(getRawDb().pragma("synchronous", { simple: true })).toBe(1);
  });

  // TC10: account B on the same server never reads account A's rows, and
  // A's row is still there for A's next sign-in.
  it("keeps each account's rows apart (TC10)", async () => {
    await CloudLocalStore.putDraft(A, DOC, BASE, "content of A");
    expect(await CloudLocalStore.listDrafts(B)).toEqual([]);
    expect(await CloudLocalStore.getDraft(B, DOC)).toBeNull();
    expect(await CloudLocalStore.listDrafts(OTHER_SERVER)).toEqual([]);

    await CloudLocalStore.putDraft(B, DOC, BASE, "content of B");
    expect(await CloudLocalStore.discardDraft(B, DOC)).toBe(true);

    const rows = await CloudLocalStore.listDrafts(A, "waiting");
    expect(rows.map((row) => row.draft)).toEqual(["content of A"]);
  });

  it("refuses a call without a complete scope", async () => {
    await expect(
      CloudLocalStore.listDrafts({ ...A, accountId: "" })
    ).rejects.toThrow(/account/);
  });

  it("deletes the draft when the accepted send is the latest revision", async () => {
    const revision = await CloudLocalStore.putDraft(A, DOC, BASE, "v1");
    const saved = {
      updatedAt: "2026-11-16T10:01:00.000Z",
      contentHash: "hash-1"
    };
    expect(
      await CloudLocalStore.acceptSave(A, DOC, revision, saved, {
        role: "editor",
        options: OPTIONS
      })
    ).toBe("deleted");
    expect(await CloudLocalStore.getDraft(A, DOC)).toBeNull();
    const open = await CloudLocalStore.getOpenState(A, DOC);
    expect(open?.base_content_hash).toBe("hash-1");
    expect(open?.role).toBe("editor");
  });

  it("keeps edits made while a send was in flight", async () => {
    const sent = await CloudLocalStore.putDraft(A, DOC, BASE, "v1");
    await CloudLocalStore.putDraft(A, DOC, BASE, "v2");
    const saved = {
      updatedAt: "2026-11-16T10:01:00.000Z",
      contentHash: "hash-1"
    };
    expect(
      await CloudLocalStore.acceptSave(A, DOC, sent, saved, {
        role: "editor",
        options: OPTIONS
      })
    ).toBe("rebased");
    const row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.draft).toBe("v2");
    expect(row?.base_content_hash).toBe("hash-1");
    expect(row?.state).toBe("waiting");
  });

  it("marks a refused send unsent only for that revision", async () => {
    const sent = await CloudLocalStore.putDraft(A, DOC, BASE, "v1");
    expect(
      await CloudLocalStore.markUnsent(A, DOC, sent, "FILE_NOT_READABLE")
    ).toBe(true);
    let row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.state).toBe("unsent");
    expect(row?.refusal_reason).toBe("FILE_NOT_READABLE");

    const next = await CloudLocalStore.putDraft(A, DOC, BASE, "v2");
    expect(await CloudLocalStore.markUnsent(A, DOC, next - 1, "STALE")).toBe(
      false
    );
    row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.state).toBe("waiting");
    expect(row?.refusal_reason).toBeNull();
  });

  it("records contact and keeps the last base", async () => {
    await CloudLocalStore.recordContact(A, DOC, {
      role: "viewer",
      options: { ...OPTIONS, allow_download: true },
      base: BASE
    });
    await CloudLocalStore.recordContact(A, DOC, {
      role: "viewer",
      options: OPTIONS
    });
    const open = await CloudLocalStore.getOpenState(A, DOC);
    expect(open?.base_content_hash).toBe("hash-0");
    expect(open?.options).toEqual(OPTIONS);
    expect(await CloudLocalStore.getOpenState(B, DOC)).toBeNull();
  });
});

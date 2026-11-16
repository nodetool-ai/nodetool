import { beforeEach, describe, expect, it } from "vitest";
import {
  CloudLocalStore,
  type CloudLocalScope
} from "../src/cloud-local-store.js";
import { getRawDb, initTestDb } from "../src/db.js";
import Database from "better-sqlite3";
import {
  MigrationRunner,
  SQLiteMigrationAdapter,
  migrations
} from "../src/migrations/index.js";

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

  it("gives every draft write a new id", async () => {
    const first = await CloudLocalStore.putDraft(A, DOC, BASE, '{"v":1}');
    const second = await CloudLocalStore.putDraft(A, DOC, BASE, '{"v":2}');
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
    const row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.draft).toBe('{"v":2}');
    expect(row?.state).toBe("waiting");
    expect(row?.draft_id).toBe(second);
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

  const SAVED = { updatedAt: "2026-11-16T10:01:00.000Z", contentHash: "hash-1" };
  const ACCESS = { role: "editor", options: OPTIONS };

  it("deletes the draft when the accepted send is the latest draft", async () => {
    const sent = await CloudLocalStore.putDraft(A, DOC, BASE, "v1");
    expect(await CloudLocalStore.acceptSave(A, DOC, sent, BASE, SAVED, ACCESS)).toBe(
      "deleted"
    );
    expect(await CloudLocalStore.getDraft(A, DOC)).toBeNull();
    const open = await CloudLocalStore.getOpenState(A, DOC);
    expect(open?.base_content_hash).toBe("hash-1");
    expect(open?.role).toBe("editor");
  });

  it("keeps edits made while a send was in flight", async () => {
    const sent = await CloudLocalStore.putDraft(A, DOC, BASE, "v1");
    await CloudLocalStore.putDraft(A, DOC, BASE, "v2");
    expect(await CloudLocalStore.acceptSave(A, DOC, sent, BASE, SAVED, ACCESS)).toBe(
      "rebased"
    );
    const row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.draft).toBe("v2");
    expect(row?.base_content_hash).toBe("hash-1");
    expect(row?.state).toBe("waiting");
  });

  // Draft A is sent, discarded, and draft B written. A's late
  // acknowledgement must not delete B or move the base back.
  it("ignores a late acknowledgement of a discarded draft", async () => {
    const sentA = await CloudLocalStore.putDraft(A, DOC, BASE, "draft A");
    await CloudLocalStore.discardDraft(A, DOC);
    const newer = { updatedAt: "2026-11-16T10:05:00.000Z", contentHash: "hash-5" };
    await CloudLocalStore.recordContact(A, DOC, { ...ACCESS, base: newer });
    const sentB = await CloudLocalStore.putDraft(A, DOC, newer, "draft B");
    expect(sentB).not.toBe(sentA);

    expect(await CloudLocalStore.acceptSave(A, DOC, sentA, BASE, SAVED, ACCESS)).toBe(
      "stale"
    );
    const row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.draft).toBe("draft B");
    expect(row?.draft_id).toBe(sentB);
    expect(row?.base_content_hash).toBe("hash-5");
    const open = await CloudLocalStore.getOpenState(A, DOC);
    expect(open?.base_content_hash).toBe("hash-5");
  });

  it("marks a refused send unsent only for that draft", async () => {
    const sent = await CloudLocalStore.putDraft(A, DOC, BASE, "v1");
    expect(
      await CloudLocalStore.markUnsent(A, DOC, sent, "FILE_NOT_READABLE")
    ).toBe(true);
    let row = await CloudLocalStore.getDraft(A, DOC);
    expect(row?.state).toBe("unsent");
    expect(row?.refusal_reason).toBe("FILE_NOT_READABLE");

    await CloudLocalStore.putDraft(A, DOC, BASE, "v2");
    expect(await CloudLocalStore.markUnsent(A, DOC, sent, "STALE")).toBe(false);
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

describe("add_cloud_local_store rollback", () => {
  // A rollback must not destroy the only copy of edits the cloud server
  // has not accepted.
  it("keeps waiting drafts when the migration is rolled back", async () => {
    const db = new Database(":memory:");
    const adapter = new SQLiteMigrationAdapter(db);
    const chain = migrations.filter((m) => m.version <= "20261126_000000");
    const runner = new MigrationRunner(adapter, chain);
    await runner.migrate();
    db.prepare(
      `INSERT INTO cloud_drafts (id, user_id, server_key, account_id, kind, document_id,
         base_updated_at, base_content_hash, draft, state, draft_id, created_at, updated_at)
       VALUES ('r1', '1', 'a1b2c3d4e5f60718', 'acc', 'workflow', 'doc', 't', 'h',
         'unsent edits', 'waiting', 'd1', 't', 't')`
    ).run();

    expect(await runner.rollback(1)).toEqual(["20261126_000000"]);
    expect(await adapter.tableExists("cloud_drafts")).toBe(true);
    const row = db.prepare("SELECT draft FROM cloud_drafts").get() as { draft: string };
    expect(row.draft).toBe("unsent edits");
    await runner.migrate();
    expect(db.prepare("SELECT COUNT(*) AS n FROM cloud_drafts").get()).toEqual({ n: 1 });
  });
});

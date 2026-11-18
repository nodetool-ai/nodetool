/**
 * TC120, TR11: the saver scenarios of the native CloudDocumentSaver tests
 * (`native/account/tests/cloud.cpp`), run against the desktop saver with
 * the same fake store and fake server.
 */
import { createHash } from "crypto";
import {
  CloudDocumentSaver,
  DRAFT_MAX_DELAY_MS,
  SEND_RETRY_MS,
  type AcceptOutcome,
  type CloudBase,
  type CloudDocumentKey,
  type CloudSaver,
  type DraftStore,
  type SaveResult,
  type SaveStatus,
  type StoredDraft
} from "../CloudDocumentSaver";
import { LocalDraftStore, serverKeyOf, type LocalDraftsClient } from "../localDraftStore";

const KEY: CloudDocumentKey = {
  serverKey: "0123456789abcdef",
  accountId: "u1",
  kind: "workflow",
  documentId: "w1"
};

class FakeDraftStore implements DraftStore {
  full = false;
  failAccept = false;
  failMark = false;
  row: StoredDraft | null = null;
  puts: string[] = [];
  unsentReason = "";
  accepts = 0;
  private writes = 0;

  async put(key: CloudDocumentKey, base: CloudBase, draft: string): Promise<string | null> {
    if (this.full) {
      return null;
    }
    this.writes += 1;
    this.row = { key, draftId: `d${this.writes}`, base, draft, state: "waiting", refusal: "" };
    this.puts.push(draft);
    return this.row.draftId;
  }

  async accept(_key: CloudDocumentKey, draftId: string, sentBase: CloudBase, base: CloudBase): Promise<AcceptOutcome | null> {
    this.accepts += 1;
    if (this.full || this.failAccept) {
      return null;
    }
    if (!this.row) {
      return "no_draft";
    }
    if (this.row.draftId === draftId) {
      this.row = null;
      return "deleted";
    }
    if (this.row.base.contentHash !== sentBase.contentHash) {
      return "stale";
    }
    this.row.base = base;
    return "rebased";
  }

  async markUnsent(_key: CloudDocumentKey, draftId: string, reason: string): Promise<boolean> {
    if (this.failMark) {
      return false;
    }
    if (this.row && this.row.draftId === draftId) {
      this.row.state = "unsent";
      this.row.refusal = reason;
    }
    this.unsentReason = reason;
    return true;
  }
}

class FakeCloud implements CloudSaver {
  status: SaveStatus = "ok";
  saves: [string, string][] = [];
  instances: string[] = [];
  private duringSave: (() => void) | null = null;

  async save(_key: CloudDocumentKey, instance: string, base: CloudBase, draft: string): Promise<SaveResult> {
    this.saves.push([base.contentHash, draft]);
    this.instances.push(instance);
    const hook = this.duringSave;
    this.duringSave = null;
    hook?.();
    const n = this.saves.length;
    return {
      status: this.status,
      base: { updatedAt: `t${n}`, contentHash: `h${n}` },
      role: "owner",
      options: { allowHistory: false, allowDownload: false, allowDuplicate: false },
      reason: "FILE_NOT_READABLE"
    };
  }

  onNextSave(hook: () => void): void {
    this.duringSave = hook;
  }
}

async function tick(saver: CloudDocumentSaver, nowMs: number): Promise<void> {
  await saver.persist(nowMs);
  await saver.send(nowMs);
}

function fresh() {
  const store = new FakeDraftStore();
  const cloud = new FakeCloud();
  const saver = new CloudDocumentSaver(store, cloud, { key: KEY, base: { updatedAt: "t0", contentHash: "h0" } });
  return { store, cloud, saver };
}

test("savedOnlyAfterAcceptance", async () => {
  const { store, cloud, saver } = fresh();
  expect(saver.state().status).toBe("savedToCloud");
  saver.edit("v1", 1000);
  expect(saver.state().status).toBe("changesWaiting");
  expect(saver.state().unstoredEdits).toBe(true);
  await tick(saver, 1100);
  // Not idle long enough yet: nothing written.
  expect(store.puts).toEqual([]);
  await tick(saver, 1200);
  expect(store.puts).toEqual(["v1"]);
  expect(cloud.saves).toHaveLength(1);
  expect(saver.state().status).toBe("savedToCloud");
  expect(saver.state().unstoredEdits).toBe(false);
  expect(store.row).toBeNull();
  expect(saver.state().lastContactMs).toBe(1200);
});

test.each([100, 250])("writesWithin750msWhileTyping, a tick every %i ms", async (tickEvery) => {
  const { store, saver } = fresh();
  let firstWriteAt = -1;
  for (let now = 0; now <= 2000 && firstWriteAt < 0; now += 50) {
    saver.edit(`v${now}`, now);
    if (now % tickEvery === 0) {
      await tick(saver, now);
    }
    if (store.puts.length > 0) {
      firstWriteAt = now;
    }
  }
  expect(firstWriteAt).toBeGreaterThanOrEqual(0);
  expect(firstWriteAt).toBeLessThanOrEqual(DRAFT_MAX_DELAY_MS);
});

test("tc9DiskFull: Not saving within 5 s, never Saved, and the held edits are written later", async () => {
  const { store, cloud, saver } = fresh();
  store.full = true;
  saver.edit("v1", 0);
  let notSavingAt = -1;
  let savedShown = false;
  for (let now = 0; now <= 10_000; now += 100) {
    await tick(saver, now);
    const s = saver.state();
    if (s.status === "notSaving" && notSavingAt < 0) {
      notSavingAt = now;
    }
    savedShown = savedShown || s.status === "savedToCloud";
  }
  expect(notSavingAt).toBeGreaterThanOrEqual(0);
  expect(notSavingAt).toBeLessThanOrEqual(5000);
  expect(savedShown).toBe(false);
  expect(cloud.saves).toEqual([]);
  expect(saver.state().unstoredEdits).toBe(true);

  store.full = false;
  for (let now = 10_100; now <= 13_000; now += 100) {
    await tick(saver, now);
  }
  expect(store.puts).toEqual(["v1"]);
  expect(saver.state().status).toBe("savedToCloud");
});

test("notSavedWhileTheAcceptanceIsUnrecorded", async () => {
  const { store, cloud, saver } = fresh();
  store.failAccept = true;
  saver.edit("v1", 0);
  await tick(saver, 300);
  expect(saver.state().status).toBe("notSaving");
  // An offline cloud does not hide the local failure.
  cloud.status = "offline";
  await tick(saver, 2300);
  expect(saver.state().status).toBe("notSaving");
  cloud.status = "ok";
  store.failAccept = false;
  await tick(saver, 8000);
  expect(saver.state().status).toBe("savedToCloud");
  expect(store.row).toBeNull();
  // The record was retried alone: the server saw the draft once.
  expect(cloud.saves).toHaveLength(1);
});

test("keepsEditsMadeDuringASend", async () => {
  const { store, cloud, saver } = fresh();
  saver.edit("v1", 0);
  cloud.onNextSave(() => saver.edit("v2", 250));
  await tick(saver, 300);
  expect(saver.state().status).toBe("changesWaiting");
  expect(saver.state().unstoredEdits).toBe(true);
  await tick(saver, 600);
  expect(store.puts).toEqual(["v1", "v2"]);
  expect(cloud.saves).toHaveLength(2);
  // The second save edits the version the first one produced.
  expect(cloud.saves[1]).toEqual(["h1", "v2"]);
  expect(saver.state().status).toBe("savedToCloud");
});

test("refusedSaveBecomesUnsent", async () => {
  const { store, cloud, saver } = fresh();
  cloud.status = "refused";
  saver.edit("v1", 0);
  await tick(saver, 300);
  expect(saver.state().status).toBe("unsent");
  expect(saver.state().refusal).toBe("FILE_NOT_READABLE");
  expect(store.unsentReason).toBe("FILE_NOT_READABLE");
  expect(store.row?.draft).toBe("v1");
  // No retry of a refused save.
  await tick(saver, 10_000);
  expect(cloud.saves).toHaveLength(1);
  saver.edit("v2", 10_000);
  expect(saver.state().status).toBe("changesWaiting");
  expect(saver.state().refusal).toBe("");
});

test("retriesWhileOfflineOrSignedOut", async () => {
  const { store, cloud, saver } = fresh();
  cloud.status = "offline";
  saver.edit("v1", 0);
  await tick(saver, 300);
  expect(saver.state().status).toBe("offline");
  await tick(saver, 1000);
  expect(cloud.saves).toHaveLength(1);
  cloud.status = "signedOut";
  await tick(saver, 300 + SEND_RETRY_MS);
  expect(saver.state().status).toBe("signedOut");
  expect(store.row?.draft).toBe("v1");
  cloud.status = "ok";
  await tick(saver, 300 + 2 * SEND_RETRY_MS);
  expect(saver.state().status).toBe("savedToCloud");
});

test("a failing local write is never hidden behind a later cloud status", async () => {
  const { store, cloud, saver } = fresh();
  cloud.status = "offline";
  saver.edit("v1", 0);
  await tick(saver, 300);
  expect(saver.state().status).toBe("offline");
  store.full = true;
  saver.edit("v2", 400);
  await tick(saver, 700);
  expect(saver.state().status).toBe("notSaving");
  // The stored v1 is sent again and the server is still away.
  await tick(saver, 300 + SEND_RETRY_MS);
  expect(cloud.saves).toHaveLength(2);
  expect(saver.state().status).toBe("notSaving");
});

test("a failed local write of a refusal is retried alone", async () => {
  const { store, cloud, saver } = fresh();
  cloud.status = "refused";
  store.failMark = true;
  saver.edit("v1", 0);
  await tick(saver, 300);
  expect(saver.state().status).toBe("notSaving");
  store.failMark = false;
  await tick(saver, 2300);
  expect(saver.state().status).toBe("unsent");
  expect(cloud.saves).toHaveLength(1);
});

test("a resumed waiting draft is sent again on its base, and an unsent one shows its refusal", async () => {
  const store = new FakeDraftStore();
  const cloud = new FakeCloud();
  const waiting: StoredDraft = {
    key: KEY,
    draftId: "d9",
    base: { updatedAt: "t5", contentHash: "h5" },
    draft: "kept",
    state: "waiting",
    refusal: ""
  };
  store.row = { ...waiting };
  const saver = new CloudDocumentSaver(store, cloud, { resumed: waiting });
  expect(saver.state()).toMatchObject({ status: "changesWaiting", waitingEdits: 1 });
  await tick(saver, 0);
  expect(cloud.saves).toEqual([["h5", "kept"]]);
  expect(saver.state()).toMatchObject({ status: "savedToCloud", waitingEdits: 0 });

  const unsent = new CloudDocumentSaver(store, cloud, {
    resumed: { ...waiting, state: "unsent", refusal: "FORBIDDEN" }
  });
  expect(unsent.state()).toMatchObject({ status: "unsent", refusal: "FORBIDDEN" });
  await tick(unsent, 0);
  expect(cloud.saves).toHaveLength(1);
});

test("oneInstancePerOpenDocument", async () => {
  const { cloud, saver } = fresh();
  saver.edit("v1", 0);
  await tick(saver, 300);
  saver.edit("v2", 1000);
  await tick(saver, 1300);
  const other = fresh();
  other.saver.edit("x", 0);
  await tick(other.saver, 300);
  expect(cloud.instances).toHaveLength(2);
  expect(new Set(cloud.instances).size).toBe(1);
  expect(cloud.instances[0]).toMatch(/^[0-9a-f]{32}$/);
  expect(other.cloud.instances[0]).not.toBe(cloud.instances[0]);
});

test("flush writes at once and says whether an edit is still only in memory", async () => {
  const { store, saver } = fresh();
  saver.edit("v1", 0);
  expect(await saver.flush(1)).toBe(true);
  expect(store.puts).toEqual(["v1"]);
  store.full = true;
  saver.edit("v2", 2);
  expect(await saver.flush(3)).toBe(false);
  expect(saver.state().status).toBe("notSaving");
});

test("a persist while one is running writes nothing twice", async () => {
  const { store, saver } = fresh();
  saver.edit("v1", 0);
  await Promise.all([saver.persist(300), saver.persist(300)]);
  expect(store.puts).toEqual(["v1"]);
});

describe("LocalDraftStore", () => {
  function client(): jest.Mocked<{
    put: { mutate: jest.Mock };
    get: { query: jest.Mock };
    accept: { mutate: jest.Mock };
    markUnsent: { mutate: jest.Mock };
  }> {
    return {
      put: { mutate: jest.fn(async () => ({ draft_id: "d1" })) },
      get: { query: jest.fn(async () => ({ draft: null })) },
      accept: { mutate: jest.fn(async () => ({ outcome: "deleted" })) },
      markUnsent: { mutate: jest.fn(async () => ({ marked: false })) }
    };
  }

  it("names the server key, the account and the document in every call", async () => {
    const drafts = client();
    const store = new LocalDraftStore(drafts as unknown as LocalDraftsClient);
    expect(await store.put(KEY, { updatedAt: "t0", contentHash: "h0" }, "doc")).toBe("d1");
    expect(drafts.put.mutate).toHaveBeenCalledWith({
      server_key: "0123456789abcdef",
      account_id: "u1",
      kind: "workflow",
      document_id: "w1",
      base: { updated_at: "t0", content_hash: "h0" },
      draft: "doc"
    });
    expect(
      await store.accept(KEY, "d1", { updatedAt: "t0", contentHash: "h0" }, { updatedAt: "t1", contentHash: "h1" }, "owner", {
        allowHistory: true,
        allowDownload: false,
        allowDuplicate: false
      })
    ).toBe("deleted");
    expect(drafts.accept.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        draft_id: "d1",
        sent_base: { updated_at: "t0", content_hash: "h0" },
        base: { updated_at: "t1", content_hash: "h1" },
        options: { allow_history: true, allow_download: false, allow_duplicate: false }
      })
    );
    // A draft that changed since the send is left waiting, which commits too.
    expect(await store.markUnsent(KEY, "d1", "FORBIDDEN")).toBe(true);
  });

  it("answers null or false when the local server does not commit", async () => {
    const drafts = client();
    drafts.put.mutate.mockRejectedValue(new Error("SQLITE_FULL"));
    drafts.accept.mutate.mockRejectedValue(new Error("down"));
    drafts.markUnsent.mutate.mockRejectedValue(new Error("down"));
    drafts.get.query.mockRejectedValue(new Error("down"));
    const store = new LocalDraftStore(drafts as unknown as LocalDraftsClient);
    const base = { updatedAt: "t0", contentHash: "h0" };
    expect(await store.put(KEY, base, "doc")).toBeNull();
    expect(
      await store.accept(KEY, "d1", base, base, "owner", { allowHistory: false, allowDownload: false, allowDuplicate: false })
    ).toBeNull();
    expect(await store.markUnsent(KEY, "d1", "X")).toBe(false);
    expect(await store.load(KEY)).toBeNull();
  });

  it("computes the server key as the native apps do", async () => {
    // First 16 hex characters of SHA-256("https://api.nodetool.ai").
    const expected = createHash("sha256")
      .update("https://api.nodetool.ai")
      .digest("hex")
      .slice(0, 16);
    expect(await serverKeyOf("https://api.nodetool.ai")).toBe(expected);
  });
});

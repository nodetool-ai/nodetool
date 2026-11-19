/**
 * @jest-environment node
 */
import { CloudDraftMirror, type EditorSnapshot } from "../CloudDraftMirror";
import { DRAFT_FORCE_MS, DRAFT_IDLE_MS, DRAFT_RETRY_MS, type DraftStore } from "../CloudDocumentSaver";

const KEY = { serverKey: "k", accountId: "u1", kind: "workflow", documentId: "w1" };

function fakeStore() {
  let next = 0;
  const calls: string[] = [];
  const state = { putFails: false, acceptAnswer: "deleted" as "deleted" | null };
  const store: DraftStore = {
    put: jest.fn(async (_key, base, draft) => {
      calls.push(`put ${base.updatedAt} ${draft}`);
      return state.putFails ? null : `d${++next}`;
    }),
    accept: jest.fn(async (_key, draftId, sentBase, base) => {
      calls.push(`accept ${draftId} ${sentBase.updatedAt}->${base.updatedAt}`);
      return state.acceptAnswer;
    }),
    markUnsent: jest.fn(async () => true)
  };
  return { store, calls, state };
}

function editor(document = "{}") {
  const snapshot: EditorSnapshot = { dirty: false, revision: "r1", generation: 0, document: () => document };
  return {
    snapshot,
    edit(text: string) {
      document = text;
      snapshot.dirty = true;
      snapshot.generation += 1;
    },
    saved(revision: string) {
      snapshot.dirty = false;
      snapshot.revision = revision;
    }
  };
}

describe("CloudDraftMirror", () => {
  it("stores an edit once the edits pause, and deletes it after the editor's save landed", async () => {
    const { store, calls } = fakeStore();
    const doc = editor();
    const mirror = new CloudDraftMirror(store, KEY);
    doc.edit("a");
    await mirror.update(doc.snapshot, 0);
    expect(calls).toEqual([]);
    expect(mirror.status(doc.snapshot)).toBe("storing");
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS);
    expect(calls).toEqual(["put r1 a"]);
    expect(mirror.status(doc.snapshot)).toBe("stored");

    doc.saved("r2");
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS + 10);
    expect(calls).toEqual(["put r1 a", "accept d1 r1->r2"]);
    expect(mirror.status(doc.snapshot)).toBe("clean");
  });

  it("writes within the forced delay while the person keeps typing", async () => {
    const { store, calls } = fakeStore();
    const doc = editor();
    const mirror = new CloudDraftMirror(store, KEY);
    for (let t = 0; t <= DRAFT_FORCE_MS; t += 100) {
      doc.edit(`v${t}`);
      await mirror.update(doc.snapshot, t);
    }
    expect(calls).toEqual([`put r1 v${DRAFT_FORCE_MS}`]);
  });

  it("keeps the draft while the save has not landed, and stores edits made during it on the new revision", async () => {
    const { store, calls } = fakeStore();
    const doc = editor();
    const mirror = new CloudDraftMirror(store, KEY);
    doc.edit("a");
    await mirror.update(doc.snapshot, 0);
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS);
    // The save of "a" landed while "b" was typed: still dirty, on r2.
    doc.snapshot.revision = "r2";
    doc.edit("b");
    await mirror.update(doc.snapshot, 1000);
    await mirror.update(doc.snapshot, 1000 + DRAFT_IDLE_MS);
    expect(calls).toEqual(["put r1 a", "put r2 b"]);
    doc.saved("r3");
    await mirror.update(doc.snapshot, 2000);
    expect(calls.at(-1)).toBe("accept d2 r2->r3");
  });

  it("reads Not saving when the local write fails, and retries it", async () => {
    const { store, calls, state } = fakeStore();
    const doc = editor();
    const mirror = new CloudDraftMirror(store, KEY);
    state.putFails = true;
    doc.edit("a");
    await mirror.update(doc.snapshot, 0);
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS);
    expect(mirror.status(doc.snapshot)).toBe("notSaving");
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS + 10);
    expect(calls).toHaveLength(1);
    state.putFails = false;
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS + DRAFT_RETRY_MS);
    expect(calls).toHaveLength(2);
    expect(mirror.status(doc.snapshot)).toBe("stored");
  });

  it("keeps the draft when the store does not record the acceptance, and tries again", async () => {
    const { store, calls, state } = fakeStore();
    const doc = editor();
    const mirror = new CloudDraftMirror(store, KEY);
    doc.edit("a");
    await mirror.update(doc.snapshot, 0);
    await mirror.update(doc.snapshot, DRAFT_IDLE_MS);
    state.acceptAnswer = null;
    doc.saved("r2");
    await mirror.update(doc.snapshot, 1000);
    expect(mirror.status(doc.snapshot)).toBe("stored");
    state.acceptAnswer = "deleted";
    await mirror.update(doc.snapshot, 1100);
    expect(calls.filter((c) => c.startsWith("accept"))).toHaveLength(2);
    expect(mirror.status(doc.snapshot)).toBe("clean");
  });

  it("flushes the latest edit at once when the document closes", async () => {
    const { store, calls } = fakeStore();
    const doc = editor();
    const mirror = new CloudDraftMirror(store, KEY);
    doc.edit("a");
    await mirror.update(doc.snapshot, 0);
    expect(await mirror.flush(doc.snapshot)).toBe(true);
    expect(calls).toEqual(["put r1 a"]);
    expect(await mirror.flush(doc.snapshot)).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

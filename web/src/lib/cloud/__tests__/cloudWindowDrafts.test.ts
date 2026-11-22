/**
 * The drafts driver of the cloud window's D26 kinds: it stores an edit within
 * the saved-state rule, accepts the draft after the editor's save, takes a
 * waiting draft up again and never writes over an unsent one.
 */
import { describe, expect, it } from "@jest/globals";

import { CloudWindowDraftDriver, type DraftableEditor, type DraftStoreForDriver } from "../cloudWindowDrafts";
import type { CloudBase, CloudDocumentKey, StoredDraft } from "../CloudDocumentSaver";

class FakeStore implements DraftStoreForDriver {
  stored: StoredDraft | null = null;
  puts: { base: CloudBase; draft: string }[] = [];
  accepted: string[] = [];

  async load(key: CloudDocumentKey) {
    return { draft: this.stored ? { ...this.stored, key } : null };
  }
  async put(_key: CloudDocumentKey, base: CloudBase, draft: string) {
    this.puts.push({ base, draft });
    return `d${this.puts.length}`;
  }
  async accept(_key: CloudDocumentKey, draftId: string) {
    this.accepted.push(draftId);
    return "deleted" as const;
  }
  async markUnsent() {
    return true;
  }
}

class FakeEditor implements DraftableEditor {
  readonly kind = "jsscript";
  readonly documentId = "j1";
  rev: string | null = "r1";
  isDirty = false;
  text = "a";
  resumed: StoredDraft[] = [];
  revision() {
    return this.rev;
  }
  dirty() {
    return this.isDirty;
  }
  content() {
    return this.text;
  }
  document() {
    return this.text;
  }
  resume(draft: StoredDraft) {
    this.resumed.push(draft);
    this.text = draft.draft;
    this.isDirty = true;
    return true;
  }
}

const waiting = (state: StoredDraft["state"]): StoredDraft => ({
  key: { serverKey: "k", accountId: "u1", kind: "jsscript", documentId: "j1" },
  draftId: "old",
  base: { updatedAt: "r0", contentHash: "" },
  draft: "from before",
  state,
  refusal: state === "unsent" ? "FILE_NOT_READABLE" : ""
});

const OWNER = { serverKey: "k", accountId: "u1" };

describe("CloudWindowDraftDriver", () => {
  it("stores an edit after a pause and accepts it once the save lands", async () => {
    const editor = new FakeEditor();
    const store = new FakeStore();
    const driver = new CloudWindowDraftDriver(editor, store, OWNER);
    await driver.tick(0);
    await driver.tick(10);
    editor.text = "ab";
    editor.isDirty = true;
    await driver.tick(100);
    expect(store.puts).toHaveLength(0);
    await driver.tick(400);
    expect(store.puts).toEqual([{ base: { updatedAt: "r1", contentHash: "" }, draft: "ab" }]);

    editor.isDirty = false;
    editor.rev = "r2";
    await driver.tick(700);
    expect(store.accepted).toEqual(["d1"]);
  });

  it("waits for the document to load before it asks for a draft", async () => {
    const editor = new FakeEditor();
    editor.rev = null;
    const store = new FakeStore();
    store.stored = waiting("waiting");
    const driver = new CloudWindowDraftDriver(editor, store, OWNER);
    await driver.tick(0);
    expect(editor.resumed).toHaveLength(0);
    editor.rev = "r1";
    await driver.tick(250);
    expect(editor.resumed.map((draft) => draft.draftId)).toEqual(["old"]);
  });

  it("takes a waiting draft up again and accepts it after the save", async () => {
    const editor = new FakeEditor();
    const store = new FakeStore();
    store.stored = waiting("waiting");
    const driver = new CloudWindowDraftDriver(editor, store, OWNER);
    await driver.tick(0);
    expect(editor.text).toBe("from before");
    editor.isDirty = false;
    editor.rev = "r2";
    await driver.tick(250);
    await driver.tick(500);
    expect(store.accepted).toEqual(["old"]);
  });

  it("never writes over a draft the server refused", async () => {
    const editor = new FakeEditor();
    const store = new FakeStore();
    store.stored = waiting("unsent");
    const driver = new CloudWindowDraftDriver(editor, store, OWNER);
    await driver.tick(0);
    expect(editor.resumed).toHaveLength(0);
    editor.text = "edited";
    editor.isDirty = true;
    await driver.tick(1000);
    await driver.tick(2000);
    expect(store.puts).toHaveLength(0);
  });
});

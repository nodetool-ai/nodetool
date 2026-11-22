import { describe, it, expect, beforeEach } from "@jest/globals";

import { emptyJsScriptDocument, useJsScriptStore } from "../../../stores/jsScript/JsScriptStore";
import type { StoredDraft } from "../../../lib/cloud/CloudDocumentSaver";
import { jsScriptDraftDocument, jsScriptDraftEditor, resumeJsScriptDraft } from "../useCloudWindowJsScriptDrafts";

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "a", kind: "jsscript", documentId: "j1" },
  draftId: "d1",
  base: { updatedAt: "2026-11-22T10:00:00Z", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

describe("cloud window JS script drafts", () => {
  beforeEach(() => {
    useJsScriptStore.getState().removeScript("j1");
    useJsScriptStore.getState().loadScript("j1", { name: "Tidy", document: emptyJsScriptDocument() });
  });

  it("takes a stored draft up again as edits, outside undo history", () => {
    const store = useJsScriptStore;
    const draft = JSON.stringify({ name: "Tidier", document: { ...emptyJsScriptDocument(), code: "return 1;" } });
    const before = store.getState().scripts.j1;
    expect(resumeJsScriptDraft(store, "j1", stored(draft))).toBe(true);
    const entry = store.getState().scripts.j1;
    expect(entry.name).toBe("Tidier");
    expect(entry.document.code).toBe("return 1;");
    expect(entry).not.toBe(before);
    expect(store.getState().history.j1?.past ?? []).toHaveLength(0);
    expect(JSON.parse(jsScriptDraftDocument(store, "j1"))).toEqual(JSON.parse(draft));
  });

  it("refuses a draft that is not a JS script document", () => {
    const store = useJsScriptStore;
    expect(resumeJsScriptDraft(store, "j1", stored("not json"))).toBe(false);
    expect(resumeJsScriptDraft(store, "j1", stored(JSON.stringify({ name: "x", document: { tracks: [] } })))).toBe(false);
    expect(store.getState().scripts.j1.name).toBe("Tidy");
  });

  it("reads the save status as unsaved edits and the server revision as the base", () => {
    const store = useJsScriptStore;
    const editor = jsScriptDraftEditor(store, "j1");
    store.getState().setServerRevision("j1", null);
    expect(editor.revision()).toBeNull();
    store.getState().setServerRevision("j1", "r1");
    expect(editor.revision()).toBe("r1");
    for (const [status, dirty] of [
      ["saved", false],
      ["reloaded", false],
      ["unsaved", true],
      ["saving", true],
      ["error", true]
    ] as const) {
      store.getState().setSaveStatus("j1", status);
      expect(editor.dirty()).toBe(dirty);
    }
  });
});

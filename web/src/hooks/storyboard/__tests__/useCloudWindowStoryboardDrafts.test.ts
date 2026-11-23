import { describe, it, expect, beforeEach } from "@jest/globals";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardSaveStatusStore } from "../../../stores/storyboard/StoryboardSaveStatusStore";
import type { StoredDraft } from "../../../lib/cloud/CloudDocumentSaver";
import {
  resumeStoryboardDraft,
  storyboardDraftDocument,
  storyboardDraftEditor
} from "../useCloudWindowStoryboardDrafts";

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "a", kind: "storyboard", documentId: "b1" },
  draftId: "d1",
  base: { updatedAt: "2026-11-22T10:00:00Z", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

describe("cloud window storyboard drafts", () => {
  beforeEach(() => {
    useStoryboardStore.getState().removeBoard("b1");
    useStoryboardStore.getState().ensureBoard("b1");
  });

  it("takes a stored draft up again as edits, outside undo history", () => {
    const store = useStoryboardStore;
    const draft = JSON.parse(storyboardDraftDocument(store, "b1"));
    draft.name = "Launch boards";
    draft.document.brief = "A night launch";
    draft.timelineId = "tl1";
    expect(resumeStoryboardDraft(store, "b1", stored(JSON.stringify(draft)))).toBe(true);
    const board = store.getState().boards.b1;
    expect(board.title).toBe("Launch boards");
    expect(board.brief).toBe("A night launch");
    expect(board.timelineId).toBe("tl1");
    expect(store.getState().history.b1?.past ?? []).toHaveLength(0);
    expect(JSON.parse(storyboardDraftDocument(store, "b1"))).toEqual(draft);
  });

  it("refuses a draft that is not a storyboard document", () => {
    const store = useStoryboardStore;
    expect(resumeStoryboardDraft(store, "b1", stored("not json"))).toBe(false);
    expect(resumeStoryboardDraft(store, "b1", stored(JSON.stringify({ name: "x", document: { tracks: [] } })))).toBe(false);
    expect(store.getState().boards.b1.title).toBe("");
  });

  it("reads the save status store as unsaved edits and the server revision as the base", () => {
    const store = useStoryboardStore;
    const editor = storyboardDraftEditor(store, useStoryboardSaveStatusStore, "b1");
    expect(editor.kind).toBe("storyboard");
    store.getState().setServerRevision("b1", "r1");
    expect(editor.revision()).toBe("r1");
    for (const [status, dirty] of [
      ["saved", false],
      ["reloaded", false],
      ["unsaved", true],
      ["saving", true],
      ["error", true]
    ] as const) {
      useStoryboardSaveStatusStore.getState().setStatus("b1", status);
      expect(editor.dirty()).toBe(dirty);
    }
  });
});

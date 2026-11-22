import { describe, it, expect, beforeEach } from "@jest/globals";

import { useScriptStore } from "../../../stores/script/ScriptStore";
import type { StoredDraft } from "../../../lib/cloud/CloudDocumentSaver";
import { resumeScriptDraft, scriptDraftDocument, scriptDraftEditor } from "../useCloudWindowScriptDrafts";

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "a", kind: "script", documentId: "s1" },
  draftId: "d1",
  base: { updatedAt: "2026-11-22T10:00:00Z", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

const speaker = { id: "sp1", name: "Ada" };

describe("cloud window script drafts", () => {
  beforeEach(() => {
    useScriptStore.getState().removeScript("s1");
    useScriptStore.getState().loadScript("s1", {
      title: "Pilot",
      cast: [],
      sections: [],
      timelineId: null,
      storyboardId: null,
      setup: null
    });
  });

  it("takes a stored draft up again as edits, outside undo history", () => {
    const store = useScriptStore;
    const draft = JSON.stringify({
      name: "Pilot, take two",
      document: { cast: [speaker], sections: [] },
      timelineId: "tl1",
      storyboardId: null
    });
    expect(resumeScriptDraft(store, "s1", stored(draft))).toBe(true);
    const script = store.getState().scripts.s1;
    expect(script.title).toBe("Pilot, take two");
    expect(script.cast.map((member) => member.name)).toEqual(["Ada"]);
    expect(script.timelineId).toBe("tl1");
    expect(store.getState().history.s1?.past ?? []).toHaveLength(0);
    expect(JSON.parse(scriptDraftDocument(store, "s1"))).toMatchObject({
      name: "Pilot, take two",
      timelineId: "tl1",
      document: { cast: [speaker] }
    });
  });

  it("refuses a draft that is not a script document", () => {
    const store = useScriptStore;
    expect(resumeScriptDraft(store, "s1", stored("not json"))).toBe(false);
    expect(resumeScriptDraft(store, "s1", stored(JSON.stringify({ name: "x", document: "lines" })))).toBe(false);
    expect(store.getState().scripts.s1.title).toBe("Pilot");
  });

  it("reads the save status as unsaved edits and the server revision as the base", () => {
    const store = useScriptStore;
    const editor = scriptDraftEditor(store, "s1");
    expect(editor.kind).toBe("script");
    store.getState().setServerRevision("s1", "r1");
    expect(editor.revision()).toBe("r1");
    for (const [status, dirty] of [
      ["saved", false],
      ["reloaded", false],
      ["unsaved", true],
      ["saving", true],
      ["error", true]
    ] as const) {
      store.getState().setSaveStatus("s1", status);
      expect(editor.dirty()).toBe(dirty);
    }
  });
});

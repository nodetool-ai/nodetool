/**
 * The app builder as the cloud window's drafts driver reads it: no revision
 * until the canvas is open, dirty from the tab's save state, and a resumed
 * draft goes into the canvas as unsaved edits.
 */
import { afterEach, describe, expect, it } from "@jest/globals";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import { applicationDraftEditor } from "../useCloudWindowApplicationDrafts";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { createEmptyDocument } from "../../components/appbuilder/appData";
import { setPuckAgentHandler, type PuckAgentHandler } from "../../components/appbuilder/puck/puckAgentBridge";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";

const ID = "ap-1";
const TAB = `application:${ID}`;

function openCanvas(initial: ApplicationDocument): { current: ApplicationDocument; applied: ApplicationDocument[] } {
  const canvas = { current: initial, applied: [] as ApplicationDocument[] };
  // SAFETY: the editor reads only `document` and `applyExternalDocument`.
  const handler = {
    document: () => canvas.current,
    applyExternalDocument: (document: ApplicationDocument) => {
      canvas.applied.push(document);
      canvas.current = document;
    }
  } as unknown as PuckAgentHandler;
  setPuckAgentHandler(ID, handler);
  return canvas;
}

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "u1", kind: "application", documentId: ID },
  draftId: "d0",
  base: { updatedAt: "r0", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

afterEach(() => {
  setPuckAgentHandler(ID, null);
  useDocumentDraftStore.setState({ dirtyTabs: {}, savingTabs: {} });
});

describe("applicationDraftEditor", () => {
  it("has no revision until the canvas is open", () => {
    const editor = applicationDraftEditor(ID, () => "r1");
    expect(editor.revision()).toBeNull();
    openCanvas(createEmptyDocument("Booth"));
    expect(editor.revision()).toBe("r1");
  });

  it("is dirty while the tab is changed or saving", () => {
    const editor = applicationDraftEditor(ID, () => "r1");
    expect(editor.dirty()).toBe(false);
    useDocumentDraftStore.getState().setDirty(TAB, true);
    expect(editor.dirty()).toBe(true);
    useDocumentDraftStore.getState().setDirty(TAB, false);
    useDocumentDraftStore.getState().setSaving(TAB, true);
    expect(editor.dirty()).toBe(true);
  });

  it("stores the canvas document and changes content with each edit", () => {
    const canvas = openCanvas(createEmptyDocument("Booth"));
    const editor = applicationDraftEditor(ID, () => "r1");
    const before = editor.content();
    expect(JSON.parse(editor.document())).toEqual(canvas.current);
    expect(editor.content()).toBe(before);
    canvas.current = createEmptyDocument("Kiosk");
    expect(editor.content()).not.toBe(before);
  });

  it("resumes a draft into the canvas as unsaved edits and refuses anything else", () => {
    const canvas = openCanvas(createEmptyDocument("Booth"));
    const editor = applicationDraftEditor(ID, () => "r1");
    const draft = createEmptyDocument("Kiosk");
    expect(editor.resume(stored("not json"))).toBe(false);
    expect(editor.resume(stored(JSON.stringify({ name: "x" })))).toBe(false);
    expect(canvas.applied).toHaveLength(0);
    expect(editor.dirty()).toBe(false);

    expect(editor.resume(stored(JSON.stringify(draft)))).toBe(true);
    expect(canvas.applied.map((document) => document.ui)).toEqual([draft.ui]);
    expect(editor.dirty()).toBe(true);
  });
});

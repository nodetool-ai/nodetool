import { describe, it, expect } from "@jest/globals";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

import { createSketchInstance } from "../../../stores/sketch/SketchInstance";
import { createDefaultDocument, createDefaultLayer } from "../../../components/sketch/types";
import type { StoredDraft } from "../../../lib/cloud/CloudDocumentSaver";
import { resumeSketchDraft, sketchDraftDocument, sketchDraftEditor } from "../useCloudWindowSketchDrafts";

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "a", kind: "sketch", documentId: "s1" },
  draftId: "d1",
  base: { updatedAt: "2026-11-22T10:00:00Z", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

const opened = () => {
  const instance = createSketchInstance();
  instance.editor.setState({ document: createDefaultDocument(64, 64) });
  instance.session.getState().setLoadedDocument({ id: "s1", name: "Poster", updatedAt: "r1" }, "hash");
  return instance;
};

describe("cloud window sketch drafts", () => {
  it("takes a stored draft up again as the editor's document", () => {
    const edited = opened();
    const layer = createDefaultLayer("Ink", "raster", 64, 64);
    const document = edited.editor.getState().document;
    edited.editor.setState({ document: { ...document, layers: [...document.layers, layer] } });
    const binding: LayerWorkflowBinding = { layerId: layer.id, workflowId: "w1", status: "draft", versions: [] };
    edited.session.getState().setBindings([binding]);
    const draft = sketchDraftDocument(edited);

    const instance = opened();
    expect(resumeSketchDraft(instance, stored(draft))).toBe(true);
    expect(instance.editor.getState().document.layers.map((entry) => entry.name)).toEqual(["Background", "Ink"]);
    expect(Object.keys(instance.session.getState().bindings)).toEqual([layer.id]);
    // The editor normalizes the document it loads, so compare what it holds.
    const again = JSON.parse(sketchDraftDocument(instance));
    expect(again.layerBindings.map((entry: LayerWorkflowBinding) => [entry.layerId, entry.workflowId])).toEqual([
      [layer.id, "w1"]
    ]);
    expect(again.sketch.layers.map((entry: { id: string }) => entry.id)).toEqual(
      edited.editor.getState().document.layers.map((entry) => entry.id)
    );
  });

  it("refuses a draft that is not a sketch document", () => {
    const instance = opened();
    const before = instance.editor.getState().document;
    expect(resumeSketchDraft(instance, stored("not json"))).toBe(false);
    expect(resumeSketchDraft(instance, stored(JSON.stringify({ sketch: { tracks: [] }, layerBindings: [] })))).toBe(false);
    expect(instance.editor.getState().document).toBe(before);
  });

  it("waits for the editor to show the document, and reads its unsaved edits", () => {
    const instance = opened();
    const editor = sketchDraftEditor(instance, "s1");
    expect(editor.revision()).toBeNull();
    instance.session.getState().markHydrated("s1");
    expect(editor.revision()).toBe("r1");
    expect(editor.dirty()).toBe(false);
    instance.unsavedEdits.current = true;
    expect(editor.dirty()).toBe(true);
    instance.unsavedEdits.current = false;
    instance.session.getState().markSaveFailed(false);
    expect(editor.dirty()).toBe(true);
  });

  it("counts an edit to the document or to the bindings as a new content", () => {
    const instance = opened();
    const editor = sketchDraftEditor(instance, "s1");
    const first = editor.content();
    expect(editor.content()).toBe(first);
    instance.session.getState().setBindings([]);
    const second = editor.content();
    expect(second).not.toBe(first);
    const document = instance.editor.getState().document;
    instance.editor.setState({ document: { ...document } });
    expect(editor.content()).not.toBe(second);
  });
});

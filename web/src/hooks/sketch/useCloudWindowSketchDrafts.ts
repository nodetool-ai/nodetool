/**
 * In the desktop app's cloud window, keeps the open sketch's unsent edits in
 * the local drafts store until autosave lands them (FR11, D26). Does nothing
 * in any other window.
 *
 * The draft holds the sketch document and its layer bindings, without the
 * undo history, which the server copy carries. A resumed draft replaces the
 * editor's document outside the undo stack, as an external merge does, so
 * autosave sends it and undo cannot take it back.
 *
 * Call it inside the sketch's `SketchProvider`, after
 * `useStandaloneSketchDocument`.
 */
import { useCallback } from "react";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

import type { DraftableEditor } from "../../lib/cloud/cloudWindowDrafts";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import { useCloudWindowDrafts } from "../useCloudWindowDrafts";
import { useSketchInstance, type SketchInstance } from "../../stores/sketch/SketchInstance";
import { fromPersistedSketchEditorState } from "../../stores/sketch/persistence";
import { sketchExternalLayerOwnership, type SketchMergeDoc } from "../../stores/sketch/merge";
import { rebaselineHistoryForMerge } from "../../components/sketch/state/slices/historySlice";
import { isObjectLike } from "../../utils/typePredicates";

/** The draft of a sketch: its name, document and layer bindings. */
export function sketchDraftDocument(instance: SketchInstance): string {
  const editor = instance.editor.getState();
  const session = instance.session.getState();
  return JSON.stringify({
    name: session.name,
    sketch: { ...editor.document, toolSettings: editor.toolSettings },
    layerBindings: Object.values(session.bindings)
  });
}

/** Puts a stored draft into the editor as unsaved edits. False when it is not a sketch document. */
export function resumeSketchDraft(instance: SketchInstance, draft: StoredDraft): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  if (!isObjectLike(parsed)) {
    return false;
  }
  const { sketch, layerBindings } = parsed as { sketch?: unknown; layerBindings?: unknown };
  if (
    !isObjectLike(sketch) ||
    !Array.isArray((sketch as { layers?: unknown }).layers) ||
    !isObjectLike((sketch as { canvas?: unknown }).canvas) ||
    !Array.isArray(layerBindings)
  ) {
    return false;
  }
  const editor = instance.editor;
  const current = editor.getState().document;
  const restored = fromPersistedSketchEditorState(sketch).document;
  const before: SketchMergeDoc = {
    layers: current.layers,
    layerBindings: Object.values(instance.session.getState().bindings),
    canvas: current.canvas
  };
  const after: SketchMergeDoc = {
    layers: restored.layers,
    layerBindings,
    canvas: restored.canvas
  };
  // Undo steps carry the draft's layers, so Cmd-Z cannot revert the draft
  // and let autosave drop it (ADR 0001).
  const history = rebaselineHistoryForMerge(
    editor.getState().history,
    restored.layers,
    sketchExternalLayerOwnership(before, after)
  );
  editor.setState({ document: restored, history });
  instance.session.getState().setBindings(layerBindings as LayerWorkflowBinding[]);
  return true;
}

/** The sketch editor as the drafts driver reads it. */
export function sketchDraftEditor(instance: SketchInstance, documentId: string): DraftableEditor {
  let lastDocument: unknown = null;
  let lastBindings: unknown = null;
  let content: unknown = null;
  return {
    kind: "sketch",
    documentId,
    // Null until the editor shows this document: seeding it from the server
    // copy would replace a draft resumed before.
    revision: () => {
      const session = instance.session.getState();
      return session.hydratedDocumentId === documentId ? session.baseUpdatedAt : null;
    },
    dirty: () =>
      instance.unsavedEdits.current ||
      (instance.documentSync.current?.isSaving() ?? false) ||
      instance.session.getState().saveState === "error",
    content: () => {
      const document = instance.editor.getState().document;
      const bindings = instance.session.getState().bindings;
      if (document !== lastDocument || bindings !== lastBindings) {
        lastDocument = document;
        lastBindings = bindings;
        content = { document, bindings };
      }
      return content;
    },
    document: () => sketchDraftDocument(instance),
    resume: (draft) => resumeSketchDraft(instance, draft)
  };
}

export const useCloudWindowSketchDrafts = (documentId: string): void => {
  const instance = useSketchInstance();
  const makeEditor = useCallback((id: string) => sketchDraftEditor(instance, id), [instance]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const editor = instance.editor.subscribe(listener);
      const session = instance.session.subscribe(listener);
      return () => {
        editor();
        session();
      };
    },
    [instance]
  );
  useCloudWindowDrafts(documentId, makeEditor, subscribe);
};

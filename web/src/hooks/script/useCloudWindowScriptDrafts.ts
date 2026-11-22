/**
 * In the desktop app's cloud window, keeps the open script's unsent edits in
 * the local drafts store until autosave lands them (FR11, D26). Does nothing
 * in any other window.
 *
 * Call it after `useScriptServerSync`, whose save status it reads.
 */
import { scriptDocument } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import type { DraftableEditor } from "../../lib/cloud/cloudWindowDrafts";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import { useCloudWindowDrafts } from "../useCloudWindowDrafts";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { responseToScript, scriptToDocument } from "./useScriptServerSync";

type ScriptStore = typeof useScriptStore;

/** The draft of a script: what autosave sends for it. */
export function scriptDraftDocument(store: ScriptStore, scriptId: string): string {
  const script = store.getState().scripts[scriptId];
  if (!script) {
    return "{}";
  }
  return JSON.stringify({
    name: script.title || "Untitled script",
    document: scriptToDocument(script),
    timelineId: script.timelineId,
    storyboardId: script.storyboardId
  });
}

/** Puts a stored draft into the store as unsaved edits. False when it is not a script document. */
export function resumeScriptDraft(store: ScriptStore, scriptId: string, draft: StoredDraft): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const { name, document, timelineId, storyboardId } = parsed as Record<string, unknown>;
  const checked = scriptDocument.safeParse(document);
  const script = store.getState().scripts[scriptId];
  if (typeof name !== "string" || !checked.success || !script) {
    return false;
  }
  const fields = responseToScript({
    name,
    document: checked.data,
    timelineId: typeof timelineId === "string" ? timelineId : undefined,
    storyboardId: typeof storyboardId === "string" ? storyboardId : undefined
  });
  // `applyMerged` records no undo step and stamps the script, so autosave sends it.
  store.getState().applyMerged(scriptId, { ...script, ...fields });
  return true;
}

/** The script editor as the drafts driver reads it. */
export function scriptDraftEditor(store: ScriptStore, scriptId: string): DraftableEditor {
  return {
    kind: "script",
    documentId: scriptId,
    revision: () => store.getState().serverRevisions[scriptId] ?? null,
    dirty: () => {
      const status = store.getState().saveStatus[scriptId];
      return status === "unsaved" || status === "saving" || status === "error";
    },
    content: () => store.getState().scripts[scriptId],
    document: () => scriptDraftDocument(store, scriptId),
    resume: (draft) => resumeScriptDraft(store, scriptId, draft)
  };
}

const makeScriptEditor = (id: string): DraftableEditor => scriptDraftEditor(useScriptStore, id);

export const useCloudWindowScriptDrafts = (id: string): void => {
  useCloudWindowDrafts(id, makeScriptEditor, useScriptStore.subscribe);
};

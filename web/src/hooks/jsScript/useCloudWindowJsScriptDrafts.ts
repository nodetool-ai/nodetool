/**
 * In the desktop app's cloud window, keeps the open JS script's unsent edits
 * in the local drafts store until autosave lands them (FR11, D26). Does
 * nothing in any other window.
 *
 * Call it after `useJsScriptServerSync`, whose save status it reads.
 */
import { jsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

import type { DraftableEditor } from "../../lib/cloud/cloudWindowDrafts";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import { useCloudWindowDrafts } from "../useCloudWindowDrafts";
import { useJsScriptStore } from "../../stores/jsScript/JsScriptStore";

type JsScriptStore = typeof useJsScriptStore;

/** The draft of a JS script: its name and document, as autosave sends them. */
export function jsScriptDraftDocument(store: JsScriptStore, scriptId: string): string {
  const entry = store.getState().scripts[scriptId];
  return JSON.stringify({ name: entry?.name ?? "", document: entry?.document ?? null });
}

/** Puts a stored draft into the store as unsaved edits. False when it is not a JS script document. */
export function resumeJsScriptDraft(store: JsScriptStore, scriptId: string, draft: StoredDraft): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const { name, document } = parsed as { name?: unknown; document?: unknown };
  const checked = jsScriptDocument.safeParse(document);
  const entry = store.getState().scripts[scriptId];
  if (typeof name !== "string" || !checked.success || !entry) {
    return false;
  }
  // `applyMerged` records no undo step and stamps the entry, so autosave sends it.
  store.getState().applyMerged(scriptId, { ...entry, name, document: checked.data });
  return true;
}

/** The JS script editor as the drafts driver reads it. */
export function jsScriptDraftEditor(store: JsScriptStore, scriptId: string): DraftableEditor {
  return {
    kind: "jsscript",
    documentId: scriptId,
    revision: () => store.getState().serverRevisions[scriptId] ?? null,
    dirty: () => {
      const status = store.getState().saveStatus[scriptId];
      return status === "unsaved" || status === "saving" || status === "error";
    },
    content: () => store.getState().scripts[scriptId],
    document: () => jsScriptDraftDocument(store, scriptId),
    resume: (draft) => resumeJsScriptDraft(store, scriptId, draft)
  };
}

const makeJsScriptEditor = (id: string): DraftableEditor => jsScriptDraftEditor(useJsScriptStore, id);

export const useCloudWindowJsScriptDrafts = (id: string): void => {
  useCloudWindowDrafts(id, makeJsScriptEditor, useJsScriptStore.subscribe);
};

/**
 * In the desktop app's cloud window, keeps the open app's unsaved edits in
 * the local drafts store until a save lands them (FR11, D26). Does nothing in
 * any other window.
 *
 * The app builder saves on command, so a draft can stay waiting for as long
 * as the canvas holds edits. A resumed draft goes into the canvas as an
 * external document, with no undo step, and marks the app changed.
 */
import { useCallback, type MutableRefObject } from "react";

import type { DraftableEditor } from "../lib/cloud/cloudWindowDrafts";
import type { StoredDraft } from "../lib/cloud/CloudDocumentSaver";
import { useCloudWindowDrafts } from "./useCloudWindowDrafts";
import { useDocumentDraftStore } from "../stores/DocumentDraftStore";
import { parseApplicationDocument } from "../components/appbuilder/appData";
import { appDocumentFingerprint } from "../components/appbuilder/merge";
import { getPuckAgentHandler, hasPuckAgentHandler } from "../components/appbuilder/puck/puckAgentBridge";

/** Puts a stored draft into the canvas. False when it is not an app document or the canvas is not open. */
export function resumeApplicationDraft(applicationId: string, draft: StoredDraft): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  const document = parseApplicationDocument(parsed);
  if (!document || !hasPuckAgentHandler(applicationId)) {
    return false;
  }
  getPuckAgentHandler(applicationId).applyExternalDocument(document);
  // The canvas marks itself changed only on the user's edits.
  useDocumentDraftStore.getState().setDirty(`application:${applicationId}`, true);
  return true;
}

/** The app builder as the drafts driver reads it. `revision` is the row revision the canvas is based on. */
export function applicationDraftEditor(applicationId: string, revision: () => string | null): DraftableEditor {
  const tab = `application:${applicationId}`;
  return {
    kind: "application",
    documentId: applicationId,
    revision: () => (hasPuckAgentHandler(applicationId) ? revision() : null),
    dirty: () => {
      const drafts = useDocumentDraftStore.getState();
      return Boolean(drafts.dirtyTabs[tab] || drafts.savingTabs[tab]);
    },
    // The canvas assembles a fresh document on every read, so its fingerprint
    // stands for its content.
    content: () =>
      hasPuckAgentHandler(applicationId) ? appDocumentFingerprint(getPuckAgentHandler(applicationId).document()) : null,
    document: () => JSON.stringify(getPuckAgentHandler(applicationId).document()),
    resume: (draft) => resumeApplicationDraft(applicationId, draft)
  };
}

export const useCloudWindowApplicationDrafts = (
  applicationId: string,
  revisionRef: MutableRefObject<string | null>
): void => {
  const makeEditor = useCallback(
    (id: string) => applicationDraftEditor(id, () => revisionRef.current),
    [revisionRef]
  );
  useCloudWindowDrafts(applicationId, makeEditor, useDocumentDraftStore.subscribe);
};

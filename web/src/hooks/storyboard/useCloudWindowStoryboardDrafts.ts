/**
 * In the desktop app's cloud window, keeps the open storyboard's unsent edits
 * in the local drafts store until autosave lands them (FR11, D26). Does
 * nothing in any other window.
 *
 * Call it after `useStoryboardServerSync`, whose save status it reads.
 */
import { storyboardDocument } from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import type { DraftableEditor } from "../../lib/cloud/cloudWindowDrafts";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import { useCloudWindowDrafts } from "../useCloudWindowDrafts";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useStoryboardSaveStatusStore } from "../../stores/storyboard/StoryboardSaveStatusStore";
import { boardToDocument, responseToBoard } from "./useStoryboardServerSync";

type BoardStore = typeof useStoryboardStore;
type StatusStore = typeof useStoryboardSaveStatusStore;

/** The draft of a storyboard: what autosave sends for it. */
export function storyboardDraftDocument(store: BoardStore, boardId: string): string {
  const board = store.getState().boards[boardId];
  if (!board) {
    return "{}";
  }
  return JSON.stringify({
    name: board.title || "Untitled storyboard",
    document: boardToDocument(board),
    timelineId: board.timelineId
  });
}

/** Puts a stored draft into the store as unsaved edits. False when it is not a storyboard document. */
export function resumeStoryboardDraft(store: BoardStore, boardId: string, draft: StoredDraft): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const { name, document, timelineId } = parsed as Record<string, unknown>;
  const checked = storyboardDocument.safeParse(document);
  const board = store.getState().boards[boardId];
  if (typeof name !== "string" || !checked.success || !board) {
    return false;
  }
  const fields = responseToBoard({
    name,
    document: checked.data,
    timelineId: typeof timelineId === "string" ? timelineId : undefined
  });
  // `applyMerged` records no undo step and stamps the board, so autosave sends
  // it. The open shot is the editor's own state, so it stays.
  store.getState().applyMerged(boardId, { ...board, ...fields, activeShotId: board.activeShotId });
  return true;
}

/** The storyboard editor as the drafts driver reads it. */
export function storyboardDraftEditor(store: BoardStore, statuses: StatusStore, boardId: string): DraftableEditor {
  return {
    kind: "storyboard",
    documentId: boardId,
    revision: () => store.getState().serverRevisions[boardId] ?? null,
    dirty: () => {
      const status = statuses.getState().statuses[boardId];
      return status === "unsaved" || status === "saving" || status === "error";
    },
    content: () => store.getState().boards[boardId],
    document: () => storyboardDraftDocument(store, boardId),
    resume: (draft) => resumeStoryboardDraft(store, boardId, draft)
  };
}

const makeStoryboardEditor = (id: string): DraftableEditor =>
  storyboardDraftEditor(useStoryboardStore, useStoryboardSaveStatusStore, id);

/** The board and its save status each change the editor's state. */
const subscribeStoryboard = (listener: () => void): (() => void) => {
  const boards = useStoryboardStore.subscribe(listener);
  const statuses = useStoryboardSaveStatusStore.subscribe(listener);
  return () => {
    boards();
    statuses();
  };
};

export const useCloudWindowStoryboardDrafts = (id: string): void => {
  useCloudWindowDrafts(id, makeStoryboardEditor, subscribeStoryboard);
};

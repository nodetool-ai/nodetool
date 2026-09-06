/**
 * What a board was imported from, and what the post-check found.
 *
 * The source itself is a field on the document (`board.importSource`, PRD
 * § 7.7). It is a contract about the board's content, not a browser detail:
 * `preserveWords` says the Director may only add camera work and may not
 * rewrite the dialogue or the scene order (D10), the idea step holds the brief
 * while it is true, and a `ui_storyboard_*` caller driving the same board has
 * to read the same rule. These helpers are the one place that reads and writes
 * it, so every surface asks the same question of the same field.
 *
 * The words are never duplicated into the record. The screenplay and the brief
 * *are* the imported text, so a creator's edit to either is what the next run
 * preserves — which is the whole of F3.
 *
 * The notice is different. It is what the last post-check found, re-derived by
 * every run and read once by the review step, so it lives here for as long as
 * the tab is open rather than being written into a document every other
 * surface then has to ignore.
 */

import type { StoryboardImportSource } from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

/** Where a board's words came from, when they came from a file. */
export type ImportSource = StoryboardImportSource;

/** What `verifyImportedText` found, for the review step's notice. */
export type ImportNotice =
  | { kind: "fdx"; correctedShotIds: string[] }
  | { kind: "text"; missingLines: string[] };

const notices = new Map<string, ImportNotice>();
const listeners = new Set<() => void>();

const announce = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export function setImportSource(boardId: string, source: ImportSource): void {
  // A new import supersedes whatever the last run reported.
  notices.delete(boardId);
  useStoryboardStore.getState().setSetup(boardId, { importSource: source });
  announce();
}

export function getImportSource(boardId: string): ImportSource | undefined {
  return (
    useStoryboardStore.getState().getBoard(boardId)?.importSource ?? undefined
  );
}

/**
 * Keep the words, drop the structure — the creator chose to edit an imported
 * script as text (F3). The run that follows structures the brief the way it
 * does any pasted script, and the post-check flags the source lines no shot
 * picked up rather than restoring them.
 */
export function releaseImportedStructure(boardId: string): void {
  const current = getImportSource(boardId);
  if (current === undefined || current === null || !current.preserveWords) {
    return;
  }
  useStoryboardStore.getState().setSetup(boardId, {
    importSource: { ...current, kind: "text", preserveWords: false }
  });
}

export function setImportNotice(
  boardId: string,
  notice: ImportNotice | null
): void {
  if (notice) {
    notices.set(boardId, notice);
  } else {
    notices.delete(boardId);
  }
  announce();
}

export function getImportNotice(boardId: string): ImportNotice | undefined {
  return notices.get(boardId);
}

/** Forget a board's import — it was replaced, or the creator removed it. */
export function clearImport(boardId: string): void {
  notices.delete(boardId);
  useStoryboardStore.getState().setSetup(boardId, { importSource: null });
  announce();
}

/** Subscribe to notice changes. Returns the unsubscribe. */
export function subscribeToImports(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * What a board was imported from, and what the post-check found.
 *
 * The Director run in step 2 has to know whether the words it is about to
 * structure came from a file, because an FDX import is directed differently
 * (camera only, D10) and a plain-text import is checked line by line
 * afterwards. That fact belongs to the run, not to the document: nothing is
 * rendered from it and nothing on the board means anything different because
 * of it, so it lives here for as long as the tab is open rather than being
 * written into a document every other surface then has to ignore.
 *
 * Keyed by board id, because several boards can be open at once.
 */

import type { FdxImport } from "./parseFdx";

/** Where a board's words came from, when they came from a file. */
export type ImportSource =
  | { kind: "fdx"; parsed: FdxImport }
  | { kind: "text"; text: string };

/** What `verifyImportedText` found, for the review step's notice. */
export type ImportNotice =
  | { kind: "fdx"; correctedShotIds: string[] }
  | { kind: "text"; missingLines: string[] };

const sources = new Map<string, ImportSource>();
const notices = new Map<string, ImportNotice>();
const listeners = new Set<() => void>();

const announce = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export function setImportSource(boardId: string, source: ImportSource): void {
  sources.set(boardId, source);
  // A new import supersedes whatever the last run reported.
  notices.delete(boardId);
  announce();
}

export function getImportSource(boardId: string): ImportSource | undefined {
  return sources.get(boardId);
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

/** Forget a board — its tab closed, or its import was replaced by hand. */
export function clearImport(boardId: string): void {
  sources.delete(boardId);
  notices.delete(boardId);
  announce();
}

/** Subscribe to import changes. Returns the unsubscribe. */
export function subscribeToImports(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

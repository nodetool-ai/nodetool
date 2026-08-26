/**
 * Document conflict reporter
 *
 * Mediates between the code that produces merge conflicts (store actions and
 * sync hooks) and the ConflictStore that lists them. Stores must not import
 * other stores directly (DEVELOPMENT_STANDARDS §4), so they report through
 * this registry instead; the composition root installs the real writer once
 * at startup.
 */
import type { MergeConflict } from "./documentMerge";

export interface DocumentConflictHandlers {
  /** Take the external value into the draft (an undoable user edit). */
  onAccept: (unitId: string) => void;
  /** Keep the draft version and drop the offer. */
  onDiscard: () => void;
}

export type DocumentConflictReporter = (
  key: string,
  conflicts: MergeConflict[],
  handlers: DocumentConflictHandlers
) => void;

let reporter: DocumentConflictReporter | null = null;

/** Install the one real writer. Called once from the composition root. */
export function setDocumentConflictReporter(
  fn: DocumentConflictReporter
): void {
  reporter = fn;
}

/**
 * Publish the conflicts one external merge produced for one open document.
 * A no-op until the composition root installs the reporter.
 */
export function reportDocumentConflicts(
  key: string,
  conflicts: MergeConflict[],
  handlers: DocumentConflictHandlers
): void {
  reporter?.(key, conflicts, handlers);
}

/**
 * Document Sync
 *
 * An open editor holds one row of a document table (timeline sequence, image
 * document, storyboard, script, application) and autosaves it back with a
 * compare-and-swap on `updated_at`. Anything else that writes the same row —
 * an agent running headless doc-ops, the CLI, another tab — used to be
 * invisible until the next save collided with it.
 *
 * The backend already broadcasts every DBModel write as a `resource_change`
 * carrying the row's new `updated_at` and, when the writer attached them, the
 * per-merge-unit ops (see `packages/websocket/src/websocket-client-session.ts`
 * `onModelChange`). This module routes those notices to whichever editor has
 * that row open:
 *
 *   - The token matches what the editor last saved → it is the editor's own
 *     write echoing back. Ignore it.
 *   - The editor is clean → pull the server copy in (`reload`).
 *   - The editor has unsaved edits → merge the external change per merge
 *     unit (`merge`). Where both sides touched the same unit the draft wins
 *     and the refused value lands in the conflict banner. A write with no ops
 *     counts as a whole-document replacement.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";

/**
 * Where a document editor is in its initial server load. A surface that renders
 * an empty document while `"loading"` looks like an empty document, so surfaces
 * show a spinner until the first load settles.
 */
export type DocumentLoadState = "loading" | "ready" | "error";

/** `resource_type` as the backend spells it: the lowercased model class name. */
export type SyncedDocumentType =
  | "timelinesequence"
  | "imagedocument"
  | "storyboard"
  | "script"
  | "jsscript"
  | "application";

interface DocumentChangeNotice {
  event: "created" | "updated" | "deleted";
  id: string;
  /** The row's `updated_at` after the write, when the backend forwarded it. */
  updatedAt: string | null;
  /** The per-merge-unit ops the external write was made with, when attached. */
  ops?: DocumentOp[];
}

interface DocumentSyncSubscriber {
  /** The `updated_at` token the editor last read or wrote. */
  localRevision: () => string | null;
  /** Whether the editor holds edits the server has not accepted yet. */
  isDirty: () => boolean;
  /** Pull the server copy into the editor. Only called when it is clean. */
  reload: () => void;
  /**
   * Merge an external change into the dirty draft. Called instead of `reload`
   * when the editor is dirty. The implementation fetches the server copy,
   * runs the merge engine with the surface's adapter, applies the result
   * without touching undo history, and registers conflicts.
   */
  merge?: (notice: DocumentChangeNotice) => void;
  /**
   * Called for notices no other field handled — today, a delete of the open
   * row. Defaults to nothing; surfaces surface deletions themselves.
   */
  onExternalChange?: (notice: DocumentChangeNotice) => void;
}

const subscribers = new Map<string, Map<string, DocumentSyncSubscriber>>();

const keyOf = (type: SyncedDocumentType, id: string): string => `${type}:${id}`;

let nextSubscriberId = 0;

/**
 * Register an open editor for `id`. Returns the unsubscribe function; call it
 * on unmount. Several editors may watch the same row (a list panel and the
 * editor itself) — each gets its own notice.
 */
export function registerDocumentSync(
  type: SyncedDocumentType,
  id: string,
  subscriber: DocumentSyncSubscriber
): () => void {
  const key = keyOf(type, id);
  const entry = subscribers.get(key) ?? new Map<string, DocumentSyncSubscriber>();
  const subscriberId = `s${++nextSubscriberId}`;
  entry.set(subscriberId, subscriber);
  subscribers.set(key, entry);
  return () => {
    const current = subscribers.get(key);
    if (!current) return;
    current.delete(subscriberId);
    if (current.size === 0) subscribers.delete(key);
  };
}

/**
 * Route one `resource_change` notice to the editors holding that row.
 *
 * Called from `handleResourceChange`; exported for tests.
 */
export function handleDocumentResourceChange(
  type: SyncedDocumentType,
  notice: DocumentChangeNotice
): void {
  const entry = subscribers.get(keyOf(type, notice.id));
  if (!entry || entry.size === 0) return;

  for (const subscriber of [...entry.values()]) {
    if (notice.event === "created") continue;
    if (notice.event === "updated") {
      // Our own write coming back around. Without the token we cannot tell,
      // so fall through — the merge and reload branches below are both
      // non-destructive.
      if (notice.updatedAt && notice.updatedAt === subscriber.localRevision()) {
        continue;
      }
      if (!subscriber.isDirty()) {
        subscriber.reload();
        continue;
      }
      if (subscriber.merge) {
        subscriber.merge(notice);
        continue;
      }
    }
    if (subscriber.onExternalChange) subscriber.onExternalChange(notice);
  }
}

/** Test seam: drop every registration. */
export function clearDocumentSyncSubscribers(): void {
  subscribers.clear();
}

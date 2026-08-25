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
 * carrying the row's new `updated_at` (see
 * `packages/websocket/src/unified-websocket-runner.ts` `onModelChange`). This
 * module routes those notices to whichever editor has that row open:
 *
 *   - The token matches what the editor last saved → it is the editor's own
 *     write echoing back. Ignore it.
 *   - The editor is clean → pull the server copy in (`reload`).
 *   - The editor has unsaved edits → say so and keep both sides. Overwriting
 *     the canvas would drop the user's work; overwriting the server would drop
 *     the agent's.
 */
import { useNotificationStore } from "./NotificationStore";

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

/** Human name per type, used in the "changed elsewhere" message. */
const DOCUMENT_LABEL = {
  timelinesequence: "timeline",
  imagedocument: "sketch",
  storyboard: "storyboard",
  script: "script",
  jsscript: "JS script",
  application: "app"
} satisfies Record<SyncedDocumentType, string>;

interface DocumentChangeNotice {
  event: "created" | "updated" | "deleted";
  id: string;
  /** The row's `updated_at` after the write, when the backend forwarded it. */
  updatedAt: string | null;
}

interface DocumentSyncSubscriber {
  /** The `updated_at` token the editor last read or wrote. */
  localRevision: () => string | null;
  /** Whether the editor holds edits the server has not accepted yet. */
  isDirty: () => boolean;
  /** Pull the server copy into the editor. Only called when it is clean. */
  reload: () => void;
  /**
   * Called instead of `reload` when the editor is dirty, or on a delete.
   * Defaults to a deduped warning notification.
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

function warnChangedElsewhere(
  type: SyncedDocumentType,
  notice: DocumentChangeNotice
): void {
  const label = DOCUMENT_LABEL[type];
  useNotificationStore.getState().addNotification({
    type: "warning",
    alert: false,
    dedupeKey: `document-changed-elsewhere:${type}:${notice.id}`,
    replaceExisting: true,
    content:
      notice.event === "deleted"
        ? `This ${label} was deleted outside the editor.`
        : `This ${label} changed outside the editor. Your unsaved edits are still here — saving will report a conflict.`
  });
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
      // so fall through and treat it as external — the dirty/clean branches
      // below are both non-destructive.
      if (notice.updatedAt && notice.updatedAt === subscriber.localRevision()) {
        continue;
      }
    }
    if (notice.event === "updated" && !subscriber.isDirty()) {
      subscriber.reload();
      continue;
    }
    if (subscriber.onExternalChange) subscriber.onExternalChange(notice);
    else warnChangedElsewhere(type, notice);
  }
}

/** Test seam: drop every registration. */
export function clearDocumentSyncSubscribers(): void {
  subscribers.clear();
}

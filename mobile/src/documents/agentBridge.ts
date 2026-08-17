/**
 * The bridge between the `ui_*` tool layer and whatever document screen is
 * currently mounted.
 *
 * Ported from web's per-surface bridges (`storyboardAgentBridge`,
 * `timelineAgentBridge`), which key handlers by document id and never consult
 * focus. That design ports unchanged: a mounted screen registers a handler
 * under its kind + id and clears it on unmount, so a tool addresses a document
 * explicitly and fails with a useful message when it is not open.
 *
 * The one mobile difference is `focused`. Web derives it from the active tab;
 * with a native stack the screen the user is looking at is the top of the
 * stack, so screens report focus via `useFocusEffect` and we track the latest.
 *
 * Everything crossing this bridge is a plain serializable value — the tools
 * never touch a Zustand handle.
 */

import type { DocumentKind } from './kinds';

/** Identity of a document the agent can address. */
export interface OpenDocument {
  kind: DocumentKind;
  id: string;
  title: string;
}

/**
 * The human-facing label a snapshot carries. Storyboards, timelines and
 * scripts call it `title`; the JS-script surface calls it `name`. Both are
 * optional here because the authoritative title is the one passed to
 * `registerDocumentHandler` — this type exists so the marker below names a
 * real member rather than accepting anything.
 */
export interface DocumentSnapshot {
  title?: string;
  name?: string;
}

/**
 * Marker every per-kind handler interface extends.
 *
 * The bridge stores and returns handlers without calling them, so the one
 * member it can name across kinds is the snapshot reader every tool layer
 * starts from. It stays optional because a caller that only needs a document
 * listed (or a test that only needs a registration) registers no operations.
 */
interface DocumentAgentHandler {
  getSnapshot?: () => DocumentSnapshot;
}

interface Entry {
  kind: DocumentKind;
  id: string;
  title: string;
  handler: DocumentAgentHandler;
}

const key = (kind: DocumentKind, id: string): string => `${kind}:${id}`;

/** Insertion-ordered, so `listOpenDocuments` reflects open order. */
const entries = new Map<string, Entry>();

/**
 * Which document the user is looking at, held as a key rather than a resolved
 * entry and validated on read.
 *
 * A screen re-registers its handler whenever the snapshot it closes over
 * changes, which is an unregister/register pair. If unregistering cleared focus,
 * that churn would silently drop the focus hint and never restore it — the
 * screen only claims focus on navigation, not on every repaint. Validating on
 * read instead makes focus survive re-registration and still go quiet the moment
 * the document actually closes.
 */
let focusedKey: string | null = null;

/**
 * Register the handler for one mounted document. Returns the unregister
 * function, so a screen can hand it straight to a `useEffect` cleanup.
 */
export function registerDocumentHandler(
  kind: DocumentKind,
  id: string,
  title: string,
  handler: DocumentAgentHandler
): () => void {
  const k = key(kind, id);
  entries.set(k, { kind, id, title, handler });
  return () => {
    entries.delete(k);
  };
}

/** Update the title the agent sees without re-registering the handler. */
export function setDocumentTitle(
  kind: DocumentKind,
  id: string,
  title: string
): void {
  const entry = entries.get(key(kind, id));
  if (entry) {
    entry.title = title;
  }
}

/** Mark a document as the one the user is looking at (or clear with null). */
export function setFocusedDocument(
  kind: DocumentKind | null,
  id?: string
): void {
  focusedKey = kind && id ? key(kind, id) : null;
}

export function hasDocumentHandler(kind: DocumentKind, id: string): boolean {
  return entries.has(key(kind, id));
}

export function listOpenDocuments(): OpenDocument[] {
  return [...entries.values()].map(({ kind, id, title }) => ({
    kind,
    id,
    title,
  }));
}

export function focusedDocument(): OpenDocument | null {
  if (!focusedKey) {
    return null;
  }
  // A focus claim for a document that has since closed is stale, not focus.
  const entry = entries.get(focusedKey);
  return entry ? { kind: entry.kind, id: entry.id, title: entry.title } : null;
}

/**
 * Resolve the handler for a document, or throw naming the ids that *are* open.
 * The tool layer surfaces that message to the agent verbatim, which is what
 * lets it recover by calling the right id instead of guessing again.
 */
export function getDocumentHandler<T extends DocumentAgentHandler>(
  kind: DocumentKind,
  id: string
): T {
  const entry = entries.get(key(kind, id));
  if (!entry) {
    const open = listOpenDocuments()
      .filter((doc) => doc.kind === kind)
      .map((doc) => doc.id);
    throw new Error(
      `No ${kind} "${id}" is open. ` +
        (open.length > 0
          ? `Open ${kind} ids: ${open.join(', ')}.`
          : `No ${kind} documents are currently open. Ask the user to open one.`)
    );
  }
  return entry.handler as T;
}

/** Test seam: drop all registrations. */
export function resetDocumentHandlers(): void {
  entries.clear();
  focusedKey = null;
}

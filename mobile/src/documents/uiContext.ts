/**
 * `ui_context` — the block that tells the agent which document ids are valid.
 *
 * Every `ui_*` tool takes a required document id and there is no "act on
 * whatever is mounted" fallback, so this is part of the tool contract rather
 * than decoration: without it the agent has no way to learn an id and every
 * call is a guess.
 *
 * Web builds this from the tab store. Mobile builds it from the agent bridge —
 * the mounted screens *are* the open documents, and the top of the navigation
 * stack is the focused one.
 */

import { focusedDocument, listOpenDocuments } from './agentBridge';
import { uiSurfaceForKind } from './kinds';
import type { OpenDocument } from './agentBridge';

export interface UiDocumentRef {
  type: string;
  id: string;
  title?: string | null;
}

export interface UiContextPayload {
  focused?: UiDocumentRef | null;
  open?: UiDocumentRef[] | null;
  selection?: {
    clip_ids?: string[] | null;
    shot_ids?: string[] | null;
    layer_ids?: string[] | null;
  } | null;
}

/** Selection the focused screen reports, so the agent can act on "this shot". */
interface UiSelection {
  clipIds?: string[];
  shotIds?: string[];
  layerIds?: string[];
}

let selection: UiSelection = {};

/** Screens publish their current selection here; cleared on unmount. */
export function setUiSelection(next: UiSelection): void {
  selection = next;
}

export function clearUiSelection(): void {
  selection = {};
}

const toRef = (doc: OpenDocument): UiDocumentRef | null => {
  const type = uiSurfaceForKind(doc.kind);
  return type ? { type, id: doc.id, title: doc.title } : null;
};

const isRef = (ref: UiDocumentRef | null): ref is UiDocumentRef => ref !== null;

/**
 * Snapshot the open documents for an outgoing chat turn. Returns undefined when
 * nothing addressable is open, so the field is omitted rather than sent empty.
 */
export function buildUiContext(): UiContextPayload | undefined {
  const open = listOpenDocuments().map(toRef).filter(isRef);
  if (open.length === 0) {
    return undefined;
  }
  const focused = focusedDocument();
  const focusedRef = focused ? toRef(focused) : null;

  const hasSelection =
    (selection.clipIds?.length ?? 0) > 0 ||
    (selection.shotIds?.length ?? 0) > 0 ||
    (selection.layerIds?.length ?? 0) > 0;

  return {
    open,
    focused: focusedRef,
    selection: hasSelection
      ? {
          clip_ids: selection.clipIds ?? null,
          shot_ids: selection.shotIds ?? null,
          layer_ids: selection.layerIds ?? null,
        }
      : null,
  };
}

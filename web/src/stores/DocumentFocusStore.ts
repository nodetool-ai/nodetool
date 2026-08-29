// DocumentFocusStore.ts
// -----------------------------------------------------------------
// "Open that document, at this place."
//
// A cross-document link (a storyboard shot's timeline clip, a shot's
// script line) opens a tab and then has to say *where* in the opened
// document to land. The tab store carries navigation only, and the
// target's own state is out of reach at click time — a timeline's
// stores are per-instance and do not exist until its tab mounts.
//
// So the click parks a one-shot request here and the target editor
// consumes it once its document is loaded. A request that nothing
// consumes is harmless: it sits until the next one replaces it.
// -----------------------------------------------------------------

import { create } from "zustand";

export type DocumentFocusRequest =
  | { type: "timeline"; ref: string; clipId: string }
  | { type: "script"; ref: string; lineId: string }
  | { type: "storyboard"; ref: string; shotId: string };

/** The request for one `(type, ref)`, narrowed to that type's shape. */
export type DocumentFocusFor<T extends DocumentFocusRequest["type"]> = Extract<
  DocumentFocusRequest,
  { type: T }
>;

interface DocumentFocusState {
  pending: DocumentFocusRequest | null;
  /** Park a request for the document about to be opened. */
  requestDocumentFocus: (request: DocumentFocusRequest) => void;
  /**
   * Drop `request` once it has been applied. Identity-checked, so a consumer
   * that applies late cannot clear a newer request that arrived meanwhile.
   */
  clearDocumentFocus: (request: DocumentFocusRequest) => void;
}

export const useDocumentFocusStore = create<DocumentFocusState>((set) => ({
  pending: null,
  requestDocumentFocus: (request) => set({ pending: request }),
  clearDocumentFocus: (request) =>
    set((state) => (state.pending === request ? { pending: null } : state))
}));

/** Park a focus request from outside React. */
export const requestDocumentFocus = (request: DocumentFocusRequest): void =>
  useDocumentFocusStore.getState().requestDocumentFocus(request);

/** The pending request for this document, or null when it is for another. */
export const useDocumentFocusRequest = <T extends DocumentFocusRequest["type"]>(
  type: T,
  ref: string | null | undefined
): DocumentFocusFor<T> | null =>
  useDocumentFocusStore((state) => {
    const pending = state.pending;
    if (!ref || pending === null || pending.type !== type || pending.ref !== ref) {
      return null;
    }
    return pending as DocumentFocusFor<T>;
  });

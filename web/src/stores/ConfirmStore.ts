/**
 * App-wide confirmation requests, answered by the one `ConfirmDialogHost`
 * mounted at the app root.
 *
 * Use it where a confirmation is needed but no component owns a dialog: a hook
 * shared by several surfaces (some of which are keyboard shortcuts that render
 * nothing), or a plain callback. It replaces `window.confirm`, which blocks the
 * page and ignores the theme. A component that renders its own UI should
 * render `ConfirmDialog` directly instead.
 */
import type { ReactNode } from "react";
import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  content?: ReactNode;
  confirmText: string;
  cancelText?: string;
  /** Renders the confirm button in the error color, for delete and discard. */
  destructive?: boolean;
}

interface PendingConfirm {
  request: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  /** Show the dialog; resolves true on confirm, false on cancel or dismiss. */
  requestConfirm: (request: ConfirmRequest) => Promise<boolean>;
  /** Answer the open request. A second call is a no-op. */
  settle: (confirmed: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  requestConfirm: (request) =>
    new Promise<boolean>((resolve) => {
      // A newer request replaces an unanswered one; the older caller is told
      // "no" rather than left waiting forever.
      get().pending?.resolve(false);
      set({ pending: { request, resolve } });
    }),
  settle: (confirmed) => {
    const { pending } = get();
    if (!pending) return;
    set({ pending: null });
    pending.resolve(confirmed);
  }
}));

/** Ask from outside React (or from a callback) without owning a dialog. */
export const requestConfirm = (request: ConfirmRequest): Promise<boolean> =>
  useConfirmStore.getState().requestConfirm(request);

// CommandMenuStore.ts
// -----------------------------------------------------------------
// Open state of the Cmd+K command menu, shared by every surface.
//
// The app root mounts one menu host and owns the shortcut, so the menu opens
// on any view. An active node editor claims the menu while it is mounted and
// renders it itself, because its workflow, edit, and canvas commands need the
// editor's NodeContext and ReactFlow provider. Either way there is one menu
// on screen and one `open` flag.
// -----------------------------------------------------------------

import { create } from "zustand";

interface CommandMenuState {
  open: boolean;
  /** Mounted node editors that render the menu with their own commands. */
  editorClaims: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Claim the menu for an active editor; returns the release function. */
  claimForEditor: () => () => void;
}

export const useCommandMenuStore = create<CommandMenuState>((set) => ({
  open: false,
  editorClaims: 0,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  claimForEditor: () => {
    set((state) => ({ editorClaims: state.editorClaims + 1 }));
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      set((state) => ({ editorClaims: Math.max(0, state.editorClaims - 1) }));
    };
  }
}));

/** Close the menu and run the command picked from it. */
export const runCommandAndClose = (action: () => unknown): void => {
  useCommandMenuStore.getState().setOpen(false);
  void action();
};

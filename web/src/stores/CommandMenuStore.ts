// CommandMenuStore.ts
// -----------------------------------------------------------------
// Open state of the Cmd+K command menu, shared by every surface, and the
// commands the active view contributes to it.
//
// The app root mounts one menu host and owns the shortcut, so the menu opens
// on any view. An active node editor claims the menu while it is mounted and
// renders it itself, because its workflow, edit, and canvas commands need the
// editor's NodeContext and ReactFlow provider. Either way there is one menu
// on screen and one `open` flag.
//
// Every other view registers its commands here with `useContextCommands`
// (hooks/useContextCommands.ts) while its tab is active. The view's own tree
// builds the `run` closures, so they reach per-document stores the menu could
// not reach itself.
// -----------------------------------------------------------------

import { create } from "zustand";

export interface ContextCommand {
  id: string;
  label: string;
  run: () => unknown;
  /** Extra words the search matches, e.g. the group a tool belongs to. */
  keywords?: string[];
  /** Keys shown at the end of the row, e.g. "Ctrl+Shift+K". */
  shortcut?: string;
}

export interface ContextCommandGroup {
  id: number;
  heading: string;
  commands: readonly ContextCommand[];
}

interface CommandMenuState {
  open: boolean;
  /** Mounted node editors that render the menu with their own commands. */
  editorClaims: number;
  /** Commands of the active view, in registration order. */
  contextGroups: readonly ContextCommandGroup[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Claim the menu for an active editor; returns the release function. */
  claimForEditor: () => () => void;
  /** Add a group of view commands; returns the function that removes it. */
  registerContextGroup: (
    heading: string,
    commands: readonly ContextCommand[]
  ) => () => void;
}

let nextGroupId = 0;

export const useCommandMenuStore = create<CommandMenuState>((set) => ({
  open: false,
  editorClaims: 0,
  contextGroups: [],
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
  },
  registerContextGroup: (heading, commands) => {
    nextGroupId += 1;
    const id = nextGroupId;
    set((state) => ({
      contextGroups: [...state.contextGroups, { id, heading, commands }]
    }));
    return () =>
      set((state) => ({
        contextGroups: state.contextGroups.filter((group) => group.id !== id)
      }));
  }
}));

/** Close the menu and run the command picked from it. */
export const runCommandAndClose = (action: () => unknown): void => {
  useCommandMenuStore.getState().setOpen(false);
  void action();
};


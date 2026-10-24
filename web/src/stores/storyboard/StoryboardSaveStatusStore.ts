/**
 * The autosave lifecycle of each open storyboard, as the document sync
 * controller reports it. The board's document bar reads it for its
 * `SaveStatus`. It lives apart from `StoryboardStore` so a status change never
 * touches the board or its undo history.
 */

import { create } from "zustand";

export type StoryboardSaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "error"
  | "reloaded";

interface StoryboardSaveStatusState {
  statuses: Record<string, StoryboardSaveStatus>;
  setStatus: (boardId: string, status: StoryboardSaveStatus) => void;
}

export const useStoryboardSaveStatusStore = create<StoryboardSaveStatusState>(
  (set) => ({
    statuses: {},
    setStatus: (boardId, status) =>
      set((state) =>
        state.statuses[boardId] === status
          ? state
          : { statuses: { ...state.statuses, [boardId]: status } }
      )
  })
);

export const useStoryboardSaveStatus = (
  boardId: string
): StoryboardSaveStatus =>
  useStoryboardSaveStatusStore((state) => state.statuses[boardId] ?? "saved");

import { create } from "zustand";
import type { DragData, DragDropState } from "./types";

interface DragDropStore extends DragDropState {
  setActiveDrag: (data: DragData | null) => void;
  clearDrag: () => void;
}

export const useDragDropStore = create<DragDropStore>((set) => ({
  activeDrag: null,
  isDragging: false,

  setActiveDrag: (data) =>
    set({
      activeDrag: data,
      isDragging: data !== null
    }),

  clearDrag: () =>
    set({
      activeDrag: null,
      isDragging: false
    })
}));

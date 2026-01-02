/**
 * Drag & Drop State Store
 *
 * Uses Zustand for global drag state management, consistent with
 * the application's existing state management patterns.
 */

import { create } from "zustand";
import type { DragData, DragDropState } from "./types";

interface DragDropStore extends DragDropState {
  setActiveDrag: (data: DragData | null) => void;
  clearDrag: () => void;
}

/**
 * Global drag & drop state store
 *
 * Provides real-time drag state information for components that need
 * to react to ongoing drag operations (e.g., showing drop zone highlights).
 */
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

/**
 * Timeline Layout Store
 * Persists the Dockview layout for the Timeline Editor
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SerializedDockview } from "dockview";

interface TimelineLayoutStore {
  layout: SerializedDockview | null;
  setLayout: (layout: SerializedDockview) => void;
  resetLayout: () => void;
}

export const useTimelineLayoutStore = create<TimelineLayoutStore>()(
  persist(
    (set) => ({
      layout: null,
      setLayout: (layout: SerializedDockview) => set({ layout }),
      resetLayout: () => set({ layout: null })
    }),
    {
      name: "timeline-layout-storage"
    }
  )
);


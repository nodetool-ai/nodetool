/**
 * Which side panels the timeline editor shows. A per-viewer preference, kept
 * across reloads and shared by every open timeline.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TimelineLayoutState {
  /** The script transcript left of the preview. */
  transcriptVisible: boolean;
  /** The Inspector / Assistant / History panel right of the editor. */
  sidePanelVisible: boolean;
  toggleTranscript: () => void;
  toggleSidePanel: () => void;
  showSidePanel: () => void;
}

export const useTimelineLayoutStore = create<TimelineLayoutState>()(
  persist(
    (set) => ({
      transcriptVisible: true,
      sidePanelVisible: true,
      toggleTranscript: () =>
        set((state) => ({ transcriptVisible: !state.transcriptVisible })),
      toggleSidePanel: () =>
        set((state) => ({ sidePanelVisible: !state.sidePanelVisible })),
      showSidePanel: () => set({ sidePanelVisible: true })
    }),
    {
      name: "nodetool.timeline.layout",
      partialize: (state) => ({
        transcriptVisible: state.transcriptVisible,
        sidePanelVisible: state.sidePanelVisible
      })
    }
  )
);

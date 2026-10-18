/**
 * Whether the timeline editor is laid out for video or audio work, plus the
 * DAW dock and playback preferences. A per-viewer preference, kept across
 * reloads and shared by every open timeline. Panel placement and visibility
 * live in the dock layout (`useTimelineDockLayoutStore`).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The tabs of the DAW-mode bottom dock. */
export type DawDockTab = "mixer" | "devices" | "pianoRoll" | "harmony";

export const DEFAULT_DAW_DOCK_HEIGHT_PX = 320;
export const MIN_DAW_DOCK_HEIGHT_PX = 120;
export const MAX_DAW_DOCK_HEIGHT_PX = 900;

const clampDockHeight = (px: number): number =>
  Math.round(
    Math.min(MAX_DAW_DOCK_HEIGHT_PX, Math.max(MIN_DAW_DOCK_HEIGHT_PX, px))
  );

interface TimelineLayoutState {
  /**
   * DAW mode: the video preview and transcript give their height to the
   * tracks, a transport strip replaces the preview controls, and a bottom
   * dock holds the mixer, the device chain and the piano roll.
   */
  dawMode: boolean;
  /** Height of the DAW-mode bottom dock, in px. */
  dawDockHeightPx: number;
  dawDockTab: DawDockTab;
  /** Click on every beat while the timeline plays. Preview only. */
  metronomeEnabled: boolean;
  /**
   * Loop playback, Premiere's loop toggle: playback wraps at the out point
   * (or the end) back to the in point (or the start). Off, the in and out
   * points do not bound Play; Play In to Out still stops at the out point.
   */
  loopPlayback: boolean;
  toggleDawMode: () => void;
  setDawMode: (dawMode: boolean) => void;
  setDawDockHeightPx: (px: number) => void;
  setDawDockTab: (tab: DawDockTab) => void;
  toggleMetronome: () => void;
  toggleLoopPlayback: () => void;
  setLoopPlayback: (on: boolean) => void;
}

export const useTimelineLayoutStore = create<TimelineLayoutState>()(
  persist(
    (set) => ({
      dawMode: false,
      dawDockHeightPx: DEFAULT_DAW_DOCK_HEIGHT_PX,
      dawDockTab: "mixer",
      metronomeEnabled: false,
      loopPlayback: false,
      toggleDawMode: () => set((state) => ({ dawMode: !state.dawMode })),
      setDawMode: (dawMode) => set({ dawMode }),
      setDawDockHeightPx: (px) => set({ dawDockHeightPx: clampDockHeight(px) }),
      setDawDockTab: (dawDockTab) => set({ dawDockTab }),
      toggleMetronome: () =>
        set((state) => ({ metronomeEnabled: !state.metronomeEnabled })),
      toggleLoopPlayback: () =>
        set((state) => ({ loopPlayback: !state.loopPlayback })),
      setLoopPlayback: (loopPlayback) => set({ loopPlayback })
    }),
    {
      name: "nodetool.timeline.layout",
      partialize: (state) => ({
        dawMode: state.dawMode,
        dawDockHeightPx: state.dawDockHeightPx,
        dawDockTab: state.dawDockTab,
        metronomeEnabled: state.metronomeEnabled,
        loopPlayback: state.loopPlayback
      })
    }
  )
);

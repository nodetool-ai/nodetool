/**
 * TimelinePlaybackStore
 *
 * Manages playback state for the timeline editor:
 *   - currentTimeMs — current playhead position in milliseconds
 *   - isPlaying — whether the timeline is currently playing
 *   - rate — playback rate (1 = normal, 2 = 2x, etc.)
 *
 * NOD-303 will wire the actual media clock into this store.
 * This store is intentionally separate from TimelineStore so playhead
 * position updates never cause the full track/clip tree to re-render.
 */

import { create } from "zustand";

export interface TimelinePlaybackState {
  currentTimeMs: number;
  isPlaying: boolean;
  rate: number;

  setCurrentTimeMs: (timeMs: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export const useTimelinePlaybackStore = create<TimelinePlaybackState>(
  (set) => ({
    currentTimeMs: 0,
    isPlaying: false,
    rate: 1,

    setCurrentTimeMs: (timeMs) => set({ currentTimeMs: timeMs }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setRate: (rate) => set({ rate }),
    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    stop: () => set({ isPlaying: false, currentTimeMs: 0 })
  })
);

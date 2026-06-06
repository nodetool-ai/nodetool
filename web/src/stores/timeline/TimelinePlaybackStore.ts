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

import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface TimelinePlaybackState {
  currentTimeMs: number;
  isPlaying: boolean;
  rate: number;
  /** Bumped on every external seek; used by playback to restart the audio
   *  clock at the new position. The playback clock itself does NOT bump this
   *  when advancing currentTimeMs frame-by-frame. */
  seekNonce: number;

  setCurrentTimeMs: (timeMs: number) => void;
  /** Seek to a new position (bumps seekNonce). */
  seek: (timeMs: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export type TimelinePlaybackStoreApi = UseBoundStore<
  StoreApi<TimelinePlaybackState>
>;

/** Create an isolated playback store for one timeline-editor instance. */
export const createTimelinePlaybackStore = (): TimelinePlaybackStoreApi =>
  create<TimelinePlaybackState>((set) => ({
    currentTimeMs: 0,
    isPlaying: false,
    rate: 1,
    seekNonce: 0,

    setCurrentTimeMs: (timeMs) => set({ currentTimeMs: timeMs }),
    seek: (timeMs) =>
      set((s) => ({
        currentTimeMs: Math.max(0, timeMs),
        seekNonce: s.seekNonce + 1
      })),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setRate: (rate) => set({ rate }),
    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    stop: () => set({ isPlaying: false, currentTimeMs: 0 })
  }));

// Context-bound hook re-exported from the instance module.
export { useTimelinePlaybackStore } from "./TimelineInstance";

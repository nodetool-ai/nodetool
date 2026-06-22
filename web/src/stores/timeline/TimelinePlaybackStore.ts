/**
 * TimelinePlaybackStore
 *
 * Manages playback state for the timeline editor:
 *   - currentTimeMs — current playhead position in milliseconds
 *   - isPlaying — whether the timeline is currently playing
 *   - rate — playback rate (1 = normal, 2 = 2x, etc.)
 *
 * This store is intentionally separate from TimelineStore so playhead
 * position updates never cause the full track/clip tree to re-render.
 *
 * ## Transient playhead channel (performance)
 *
 * During playback the position advances ~60×/second. Writing that into the
 * reactive `currentTimeMs` every frame forces every React subscriber to
 * re-render 60×/s (playhead, ruler, preview, clips, inspector …). To avoid
 * that, the live position flows through a *transient* channel that bypasses
 * React entirely:
 *
 *   - `setTimeMs(ms)` — called ~60×/s by `PlaybackClock`. Updates the live
 *     value and notifies transient subscribers ONLY. It does NOT touch
 *     reactive state, so it triggers zero re-renders.
 *   - `getTimeMs()` — read the live position from rAF loops / imperative draw.
 *   - `subscribeTime(cb)` — subscribe to live updates (returns an unsubscribe).
 *     Consumers that need per-frame visuals (playhead `left`, compositor,
 *     timecode readouts) subscribe here and mutate the DOM/canvas directly
 *     instead of going through React state.
 *
 * The reactive `currentTimeMs` is still updated on *discrete* events — seek,
 * scrub, pause, stop — so components that only need the position at rest can
 * keep selecting it. `pause()` syncs `currentTimeMs` to the live value so the
 * reactive snapshot is correct the moment playback stops.
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

  // ── Transient playhead channel (does NOT trigger React re-renders) ─────────
  /** Read the live playhead position. Updated ~60×/s during playback. */
  getTimeMs: () => number;
  /** Push a new live playhead position. Notifies transient subscribers only;
   *  does NOT write reactive state. Called every frame by PlaybackClock. */
  setTimeMs: (timeMs: number) => void;
  /** Subscribe to live playhead updates. Returns an unsubscribe function. */
  subscribeTime: (cb: (timeMs: number) => void) => () => void;
}

export type TimelinePlaybackStoreApi = UseBoundStore<
  StoreApi<TimelinePlaybackState>
>;

/** Create an isolated playback store for one timeline-editor instance. */
export const createTimelinePlaybackStore = (): TimelinePlaybackStoreApi => {
  // Transient state — lives outside reactive Zustand state so high-frequency
  // playhead updates never trigger React renders.
  let liveTimeMs = 0;
  const timeListeners = new Set<(timeMs: number) => void>();
  const emitTime = (timeMs: number): void => {
    for (const cb of timeListeners) cb(timeMs);
  };

  return create<TimelinePlaybackState>((set) => ({
    currentTimeMs: 0,
    isPlaying: false,
    rate: 1,
    seekNonce: 0,

    setCurrentTimeMs: (timeMs) => {
      liveTimeMs = timeMs;
      emitTime(timeMs);
      set({ currentTimeMs: timeMs });
    },
    seek: (timeMs) => {
      const clamped = Math.max(0, timeMs);
      liveTimeMs = clamped;
      emitTime(clamped);
      set((s) => ({ currentTimeMs: clamped, seekNonce: s.seekNonce + 1 }));
    },
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setRate: (rate) => set({ rate }),
    play: () => set({ isPlaying: true }),
    // Sync reactive snapshot to the live position the moment playback stops.
    pause: () => set({ isPlaying: false, currentTimeMs: liveTimeMs }),
    stop: () => {
      liveTimeMs = 0;
      emitTime(0);
      set({ isPlaying: false, currentTimeMs: 0 });
    },

    getTimeMs: () => liveTimeMs,
    setTimeMs: (timeMs) => {
      liveTimeMs = timeMs;
      emitTime(timeMs);
    },
    subscribeTime: (cb) => {
      timeListeners.add(cb);
      return () => {
        timeListeners.delete(cb);
      };
    }
  }));
};

// Context-bound hooks re-exported from the instance module.
export {
  useTimelinePlaybackStore,
  useTimelinePlaybackStoreApi
} from "./TimelineInstance";

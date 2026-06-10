import { create } from "zustand";

/**
 * Transient "a live slider scrub is happening" flag.
 *
 * The image-adjustment sliders re-run their downstream subgraph in the browser
 * on every move (see `useLiveSliderWriter`). Those runs restart the per-run
 * edge-flow / node-running animations continuously — pure visual noise while
 * scrubbing. This flag lets the editor freeze those animations for the duration
 * of a drag (and a beat past the final render), independently of the
 * `instantUpdate` setting, by adding a `live-scrubbing` class to the ReactFlow
 * root (see `handle_edge_tooltip.css`).
 */
// Wide enough to bridge the gap between the last slider move and the async run
// completing — the per-run "completed" badge and ambient ring fire on
// completion, which lands after the input goes idle. `useLiveSliderWriter` also
// re-arms this on each run settle, so the window effectively extends until the
// last preview run finishes.
const IDLE_RESET_MS = 450;

interface LiveRunState {
  /** True while a live slider scrub is actively re-running the graph. */
  isScrubbing: boolean;
  /**
   * Mark scrub activity. Sets `isScrubbing` true and (re)arms a single shared
   * timer that clears it after a short idle window — so the flag stays on for
   * the whole drag and briefly past the last frame, then auto-resets.
   */
  notifyScrubActivity: () => void;
}

let resetTimer: ReturnType<typeof setTimeout> | null = null;

export const useLiveRunStore = create<LiveRunState>((set, get) => ({
  isScrubbing: false,
  notifyScrubActivity: () => {
    if (!get().isScrubbing) {
      set({ isScrubbing: true });
    }
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    resetTimer = setTimeout(() => {
      resetTimer = null;
      set({ isScrubbing: false });
    }, IDLE_RESET_MS);
  }
}));

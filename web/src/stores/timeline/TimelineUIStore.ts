/**
 * TimelineUIStore
 *
 * Manages UI-only state for the timeline editor:
 *   - selection (single + multi)
 *   - zoom (msPerPx)
 *   - horizontal scroll position (scrollLeftPx)
 *   - hover state
 *   - fullscreen flag
 *
 * Kept separate from TimelineStore so clip-geometry mutations (move, trim)
 * never force the selection panel to re-render and vice versa.
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";

export interface TimelineUIState {
  /** Set of selected clip IDs. */
  selectedClipIds: Set<string>;
  /** ID of the clip the pointer is currently hovering, or null. */
  hoveredClipId: string | null;
  /**
   * Milliseconds per pixel — the primary zoom metric.
   * Default 10 ms/px ≈ 100 px/s. Smaller = zoomed in.
   */
  msPerPx: number;
  /** Horizontal scroll offset in pixels. */
  scrollLeftPx: number;
  /** Whether the tracks area is in fullscreen mode. */
  fullscreen: boolean;

  // ── Selection ────────────────────────────────────────────────────────────

  /** Replace the selection with a single clip. */
  selectClip: (id: string) => void;
  /** Add a clip to the current selection (shift-click). */
  addToSelection: (id: string) => void;
  /** Remove a specific clip from the selection. */
  removeFromSelection: (id: string) => void;
  /** Toggle a clip's selection membership. */
  toggleSelection: (id: string) => void;
  /** Clear all selected clips. */
  clearSelection: () => void;
  /** Replace the selection with a new set of IDs (rubber-band). */
  setSelection: (ids: string[]) => void;

  // ── Hover ────────────────────────────────────────────────────────────────

  setHoveredClipId: (id: string | null) => void;

  // ── Zoom / scroll ────────────────────────────────────────────────────────

  setZoom: (msPerPx: number) => void;
  setScrollLeftPx: (px: number) => void;

  // ── Fullscreen ───────────────────────────────────────────────────────────

  setFullscreen: (full: boolean) => void;
  toggleFullscreen: () => void;
}

const MIN_MS_PER_PX = 0.5;
const MAX_MS_PER_PX = 500;

export const useTimelineUIStore = create<TimelineUIState>((set, get) => ({
  selectedClipIds: new Set(),
  hoveredClipId: null,
  msPerPx: 10,
  scrollLeftPx: 0,
  fullscreen: false,

  selectClip: (id) => set({ selectedClipIds: new Set([id]) }),

  addToSelection: (id) =>
    set((state) => ({
      selectedClipIds: new Set([...state.selectedClipIds, id])
    })),

  removeFromSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedClipIds);
      next.delete(id);
      return { selectedClipIds: next };
    }),

  toggleSelection: (id) => {
    const { selectedClipIds } = get();
    if (selectedClipIds.has(id)) {
      get().removeFromSelection(id);
    } else {
      get().addToSelection(id);
    }
  },

  clearSelection: () => set({ selectedClipIds: new Set() }),

  setSelection: (ids) => set({ selectedClipIds: new Set(ids) }),

  setHoveredClipId: (id) => set({ hoveredClipId: id }),

  setZoom: (msPerPx) =>
    set({ msPerPx: Math.min(MAX_MS_PER_PX, Math.max(MIN_MS_PER_PX, msPerPx)) }),

  setScrollLeftPx: (px) => set({ scrollLeftPx: Math.max(0, px) }),

  setFullscreen: (full) => set({ fullscreen: full }),

  toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen }))
}));

// ── Convenience selectors ──────────────────────────────────────────────────

/** Returns true when the given clip ID is selected. */
export const useIsClipSelected = (id: string): boolean =>
  useTimelineUIStore((state) => state.selectedClipIds.has(id));

/** Returns the zoom value (msPerPx). */
export const useMsPerPx = (): number =>
  useTimelineUIStore((state) => state.msPerPx);

/** Returns [selectedClipIds, clearSelection] with shallow equality. */
export const useSelectionActions = () =>
  useTimelineUIStore(
    (state) => ({
      selectedClipIds: state.selectedClipIds,
      selectClip: state.selectClip,
      addToSelection: state.addToSelection,
      clearSelection: state.clearSelection,
      toggleSelection: state.toggleSelection,
      setSelection: state.setSelection
    }),
    shallow
  );

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

import { create, type StoreApi, type UseBoundStore } from "zustand";

export type TimelineTool = "select" | "cut";

/** A reference to one transcript word: its clip and the word index within it. */
export interface WordRef {
  clipId: string;
  wordIndex: number;
}

/** A transcript word selection — an inclusive range between two endpoints. */
export interface WordSelection {
  anchor: WordRef;
  focus: WordRef;
}

export interface TimelineUIState {
  /** Set of selected clip IDs. */
  selectedClipIds: Set<string>;
  /** ID of the clip the pointer is currently hovering, or null. */
  hoveredClipId: string | null;
  /**
   * Active editor tool. "select" enables move/trim/select; "cut" turns the
   * pointer into a razor that splits a clip at the click position.
   */
  activeTool: TimelineTool;
  /**
   * Milliseconds per pixel — the primary zoom metric.
   * Default 10 ms/px ≈ 100 px/s. Smaller = zoomed in.
   */
  msPerPx: number;
  /** Horizontal scroll offset in pixels. */
  scrollLeftPx: number;
  /** Whether the tracks area is in fullscreen mode. */
  fullscreen: boolean;
  /**
   * ID of the audio track whose DSP chain editor is currently expanded
   * inline below the track row, or null if none. Only one chain editor is
   * shown at a time to keep vertical layout tractable.
   */
  expandedFxTrackId: string | null;

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

  // ── Transcript word selection ──────────────────────────────────────────────

  /** Selected transcript word range, or null when nothing is selected. */
  wordSelection: WordSelection | null;
  /** Start a word selection collapsed at `ref` (anchor === focus). */
  beginWordSelection: (ref: WordRef) => void;
  /** Move the selection's focus to `ref` (drag / shift-click). */
  extendWordSelection: (ref: WordRef) => void;
  /** Clear the word selection. */
  clearWordSelection: () => void;

  // ── Hover ────────────────────────────────────────────────────────────────

  setHoveredClipId: (id: string | null) => void;

  // ── Zoom / scroll ────────────────────────────────────────────────────────

  setZoom: (msPerPx: number) => void;
  setScrollLeftPx: (px: number) => void;

  // ── Fullscreen ───────────────────────────────────────────────────────────

  setFullscreen: (full: boolean) => void;
  toggleFullscreen: () => void;

  // ── Tool ─────────────────────────────────────────────────────────────────

  setActiveTool: (tool: TimelineTool) => void;

  // ── FX panel ─────────────────────────────────────────────────────────────

  /**
   * Expand the DSP chain editor for the given track inline below its row.
   * Pass null to collapse any open editor.
   */
  setExpandedFxTrackId: (trackId: string | null) => void;
  /** Toggle the inline DSP chain editor for the given track. */
  toggleExpandedFx: (trackId: string) => void;
}

const MIN_MS_PER_PX = 0.5;
const MAX_MS_PER_PX = 500;

export type TimelineUIStoreApi = UseBoundStore<StoreApi<TimelineUIState>>;

/** Create an isolated UI store for one timeline-editor instance. */
export const createTimelineUIStore = (): TimelineUIStoreApi =>
  create<TimelineUIState>((set, get) => ({
  selectedClipIds: new Set(),
  hoveredClipId: null,
  activeTool: "select",
  msPerPx: 10,
  scrollLeftPx: 0,
  fullscreen: false,
  expandedFxTrackId: null,
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

  wordSelection: null,

  beginWordSelection: (ref) => set({ wordSelection: { anchor: ref, focus: ref } }),

  extendWordSelection: (ref) =>
    set((state) => ({
      wordSelection: {
        anchor: state.wordSelection?.anchor ?? ref,
        focus: ref
      }
    })),

  clearWordSelection: () => set({ wordSelection: null }),

  setHoveredClipId: (id) => set({ hoveredClipId: id }),

  setZoom: (msPerPx) =>
    set({ msPerPx: Math.min(MAX_MS_PER_PX, Math.max(MIN_MS_PER_PX, msPerPx)) }),

  setScrollLeftPx: (px) => set({ scrollLeftPx: Math.max(0, px) }),

  setFullscreen: (full) => set({ fullscreen: full }),

  toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen })),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setExpandedFxTrackId: (trackId) => set({ expandedFxTrackId: trackId }),

  toggleExpandedFx: (trackId) =>
    set((state) => ({
      expandedFxTrackId:
        state.expandedFxTrackId === trackId ? null : trackId
    }))
  }));

// Context-bound hooks are defined against the active instance in the instance
// module and re-exported so existing imports keep resolving from this path.
export {
  useTimelineUIStore,
  useTimelineUIStoreApi,
  useIsClipSelected
} from "./TimelineInstance";


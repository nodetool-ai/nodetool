/**
 * TimelineUIStore
 *
 * Manages UI-only state for the timeline editor:
 *   - selection (single + multi)
 *   - zoom (msPerPx)
 *   - horizontal scroll position (scrollLeftPx)
 *   - hover state
 *   - fullscreen flag
 *   - drag/trim gesture feedback (snap guide, geometry readout)
 *
 * Kept separate from TimelineStore so clip-geometry mutations (move, trim)
 * never force the selection panel to re-render and vice versa.
 */

import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { DropMode, KeyframeProperty } from "@nodetool-ai/timeline";

export type TimelineTool = "select" | "cut";

/**
 * Rubber-band marquee rectangle in lanes-content space (the coordinate space
 * of the lanes container, so the band can span several track lanes).
 */
export interface TimelineRubberBand {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Which clip edge a pointer gesture is moving. */
export type GestureKind = "move" | "trim-start" | "trim-end";

/**
 * Live geometry of the clip under a pointer gesture, for the readout pill.
 * `inPointMs` is the source in-point (0 when the clip has none).
 */
export interface GestureReadout {
  clipId: string;
  kind: GestureKind;
  startMs: number;
  durationMs: number;
  inPointMs: number;
}

/** A reference to one transcript word: its clip and the word index within it. */
interface WordRef {
  clipId: string;
  wordIndex: number;
}

/** A transcript word selection — an inclusive range between two endpoints. */
interface WordSelection {
  anchor: WordRef;
  focus: WordRef;
}

export interface SelectedEdit {
  clipId: string;
  edge: "start" | "end";
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
   * Ripple mode: trims and deletes close the gap they would otherwise open,
   * pulling every later clip along (Premiere's ripple tools, FCP's default).
   * Off, a trim or delete leaves the rest of the sequence where it is.
   */
  rippleMode: boolean;
  /**
   * What a dropped clip does to the clips under it: overwrite them
   * (Premiere's default), insert and push them right, or overlap and let the
   * renderer cross-fade. Ctrl/Cmd during a drag forces insert.
   */
  dropMode: DropMode;
  /**
   * The edit point the keyboard trims act on: one edge of one clip, picked by
   * clicking a trim handle without dragging. Cleared with the clip selection.
   */
  selectedEdit: SelectedEdit | null;
  /** Magnet: edges snap to clips, the playhead and the grid. Alt-drag bypasses. */
  snapEnabled: boolean;
  /** The property Alt+K keyframes; the inspector's last-touched row. */
  keyframeProperty: KeyframeProperty;
  /** In and out on the source viewer's asset, clip-source milliseconds. */
  sourceRange: { inMs: number; outMs: number } | null;
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

  /** Id of the track currently being drag-reordered, or null. */
  draggingTrackId: string | null;
  /**
   * The drop target during a track drag: which track row the pointer is over
   * and whether the dragged track would land before or after it. Null when no
   * valid target is hovered (e.g. over a different-type track).
   */
  trackDropTarget: { trackId: string; position: "before" | "after" } | null;

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
  /**
   * The in-progress rubber-band rect, or null when no band gesture is active.
   * The band starts on one lane but is drawn and hit-tested across all of
   * them, so it lives here rather than in the lane that owns the gesture.
   */
  rubberBand: TimelineRubberBand | null;
  /** Set (or clear, with null) the rubber-band rect. */
  setRubberBand: (rect: TimelineRubberBand | null) => void;

  // ── Gesture feedback ─────────────────────────────────────────────────────

  /**
   * Timeline position (ms) the active drag/trim gesture is snapped to, or
   * null when no snap is engaged. Drawn as a vertical guide over the lanes.
   */
  snapGuideMs: number | null;
  /** Set (or clear, with null) the snap guide position. */
  setSnapGuide: (ms: number | null) => void;
  /** Geometry of the clip under an active drag/trim gesture, or null. */
  gestureReadout: GestureReadout | null;
  /** Set (or clear, with null) the gesture readout. */
  setGestureReadout: (readout: GestureReadout | null) => void;

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
  /**
   * A timeline position the lanes should bring into view. The lanes scroll
   * themselves — `scrollLeftPx` is written *from* their scroll handler, so it
   * is a readout, not a control. Each request is a fresh object so asking for
   * the same position twice still moves the view.
   */
  revealRequest: { timeMs: number } | null;
  /** Ask the lanes to scroll `timeMs` into view. */
  revealAt: (timeMs: number) => void;

  // ── Fullscreen ───────────────────────────────────────────────────────────

  setFullscreen: (full: boolean) => void;
  toggleFullscreen: () => void;

  // ── Tool ─────────────────────────────────────────────────────────────────

  setActiveTool: (tool: TimelineTool) => void;
  setRippleMode: (on: boolean) => void;
  toggleRippleMode: () => void;
  setDropMode: (mode: DropMode) => void;
  setSelectedEdit: (edit: SelectedEdit | null) => void;
  toggleSnap: () => void;
  setKeyframeProperty: (property: KeyframeProperty) => void;
  setSourceRange: (range: { inMs: number; outMs: number } | null) => void;

  // ── FX panel ─────────────────────────────────────────────────────────────

  /**
   * Expand the DSP chain editor for the given track inline below its row.
   * Pass null to collapse any open editor.
   */
  setExpandedFxTrackId: (trackId: string | null) => void;
  /** Toggle the inline DSP chain editor for the given track. */
  toggleExpandedFx: (trackId: string) => void;

  // ── Track drag-reorder ─────────────────────────────────────────────────────

  /** Begin dragging a track; clears any stale drop target. */
  beginTrackDrag: (trackId: string) => void;
  /** Set (or clear, with null) the current drop target during a track drag. */
  setTrackDropTarget: (
    target: { trackId: string; position: "before" | "after" } | null
  ) => void;
  /** End a track drag, clearing both the dragged id and the drop target. */
  endTrackDrag: () => void;
}

export const MIN_MS_PER_PX = 0.5;
export const MAX_MS_PER_PX = 500;

export type TimelineUIStoreApi = UseBoundStore<StoreApi<TimelineUIState>>;

/** Create an isolated UI store for one timeline-editor instance. */
export const createTimelineUIStore = (): TimelineUIStoreApi =>
  create<TimelineUIState>((set, get) => ({
  selectedClipIds: new Set(),
  hoveredClipId: null,
  activeTool: "select",
  rippleMode: false,
  dropMode: "overwrite",
  selectedEdit: null,
  snapEnabled: true,
  keyframeProperty: "opacity",
  sourceRange: null,
  msPerPx: 10,
  scrollLeftPx: 0,
  revealRequest: null,
  fullscreen: false,
  expandedFxTrackId: null,
  draggingTrackId: null,
  trackDropTarget: null,
  selectClip: (id) =>
    set({ selectedClipIds: new Set([id]), selectedEdit: null }),

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

  clearSelection: () =>
    set({ selectedClipIds: new Set(), selectedEdit: null }),

  setSelection: (ids) =>
    set({ selectedClipIds: new Set(ids), selectedEdit: null }),

  rubberBand: null,

  setRubberBand: (rect) => set({ rubberBand: rect }),

  snapGuideMs: null,

  setSnapGuide: (ms) => set({ snapGuideMs: ms }),

  gestureReadout: null,

  setGestureReadout: (readout) => set({ gestureReadout: readout }),

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

  revealAt: (timeMs) => set({ revealRequest: { timeMs: Math.max(0, timeMs) } }),

  setFullscreen: (full) => set({ fullscreen: full }),

  toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen })),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setRippleMode: (on) => set({ rippleMode: on }),

  toggleRippleMode: () => set((state) => ({ rippleMode: !state.rippleMode })),

  setDropMode: (mode) => set({ dropMode: mode }),

  setSelectedEdit: (edit) => set({ selectedEdit: edit }),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  setKeyframeProperty: (property) => set({ keyframeProperty: property }),

  setSourceRange: (range) => set({ sourceRange: range }),

  setExpandedFxTrackId: (trackId) => set({ expandedFxTrackId: trackId }),

  toggleExpandedFx: (trackId) =>
    set((state) => ({
      expandedFxTrackId:
        state.expandedFxTrackId === trackId ? null : trackId
    })),

  beginTrackDrag: (trackId) =>
    set({ draggingTrackId: trackId, trackDropTarget: null }),

  setTrackDropTarget: (target) => set({ trackDropTarget: target }),

  endTrackDrag: () => set({ draggingTrackId: null, trackDropTarget: null })
  }));

// Context-bound hooks are defined against the active instance in the instance
// module and re-exported so existing imports keep resolving from this path.
export {
  useTimelineUIStore,
  useTimelineUIStoreApi,
  useIsClipSelected
} from "./TimelineInstance";


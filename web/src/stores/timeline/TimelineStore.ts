/**
 * TimelineStore
 *
 * Central Zustand + zundo store for the timeline sequence document.
 * Mirrors NodeStore's undo/redo wiring (temporal middleware, partialize).
 *
 * Responsibilities:
 *   - Holds an in-memory copy of the TimelineSequence document
 *     (tracks + clips + markers).
 *   - Exposes pure-reducer actions: move, trim, split, duplicate, delete,
 *     addTrack, removeTrack, reorderTracks, setTrackHeight.
 *   - Each drag operation is a single zundo entry (pauseTracking /
 *     resumeTracking wrapping fine-grained moves).
 *
 * Usage:
 *   // Subscribe to a single clip's geometry only:
 *   const clip = useTimelineStore(state =>
 *     state.clips.find(c => c.id === clipId)
 *   );
 *
 *   // Mutations:
 *   const moveClip = useTimelineStore(state => state.moveClip);
 */

import { create } from "zustand";
import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import {
  splitClip,
  trimClip,
  snap,
  makeTrack,
  makeClip,
  createTimeOrderedUuid
} from "@nodetool-ai/timeline";
import type {
  TimelineSequence,
  TimelineTrack,
  TimelineClip,
  TimelineMarker
} from "@nodetool-ai/timeline";

// ── Snap threshold ─────────────────────────────────────────────────────────

const SNAP_THRESHOLD_PX = 8;

// ── State interface ────────────────────────────────────────────────────────

export interface TimelineStoreState {
  // ── Document ─────────────────────────────────────────────────────────────
  sequenceId: string | null;
  fps: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];

  // ── Initialisation ───────────────────────────────────────────────────────

  /** Load a full sequence document into the store (replaces all state). */
  loadSequence: (seq: TimelineSequence) => void;
  /** Reset the store to an empty document. */
  reset: () => void;

  // ── Track mutations ──────────────────────────────────────────────────────

  addTrack: (type: TimelineTrack["type"], name?: string) => void;
  removeTrack: (trackId: string) => void;
  /** Reorder tracks by supplying the new ordered array of track IDs. */
  reorderTracks: (orderedIds: string[]) => void;
  setTrackHeight: (trackId: string, heightPx: number) => void;
  setTrackVisible: (trackId: string, visible: boolean) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackName: (trackId: string, name: string) => void;

  // ── Clip mutations ───────────────────────────────────────────────────────

  /**
   * Move one clip by `deltaMs` and optionally reassign to a different track.
   * Snap candidates are computed from all clip boundaries + playhead + 1-s ticks.
   */
  moveClip: (
    clipId: string,
    deltaMs: number,
    toTrackId?: string,
    snapCandidates?: number[],
    msPerPx?: number,
    disableSnap?: boolean
  ) => void;

  /**
   * Move all currently-selected clips together by `deltaMs`.
   * Individual clips are snapped independently; toTrackId only applies to the
   * primary (pointer) clip — others maintain relative track positions.
   */
  moveSelectedClips: (
    primaryClipId: string,
    selectedIds: Set<string>,
    deltaMs: number,
    toTrackId?: string,
    snapCandidates?: number[],
    msPerPx?: number,
    disableSnap?: boolean
  ) => void;

  /**
   * Trim the start or end of a clip.
   * Throws (and no-ops) if the result would produce a non-positive duration.
   */
  trimClipStart: (clipId: string, deltaMs: number) => void;
  trimClipEnd: (clipId: string, deltaMs: number) => void;

  /** Split the clip at the given time. The clip must contain that time. */
  splitClipAtTime: (clipId: string, atMs: number) => void;

  /** Split all selected clips at the current playhead (passed as argument). */
  splitSelectedAtPlayhead: (currentTimeMs: number, selectedIds: Set<string>) => void;

  /**
   * Duplicate selected clips (offset by `offsetMs`, default 0 = placed at same
   * start — callers should apply a reasonable offset).
   */
  duplicateSelected: (selectedIds: Set<string>, offsetMs?: number) => void;

  /** Delete selected clips. */
  deleteSelected: (selectedIds: Set<string>) => void;

  /** Delete a single clip by ID. */
  deleteClip: (clipId: string) => void;

  /** Add a pre-built clip object directly (used by NOD-304 import). */
  addClip: (clip: TimelineClip) => void;

  /** Update an arbitrary subset of fields on a clip. */
  patchClip: (clipId: string, patch: Partial<TimelineClip>) => void;
}

// ── Partialized type for zundo (only document state is undo-able) ──────────

type PartializedState = Pick<
  TimelineStoreState,
  "tracks" | "clips" | "markers" | "durationMs"
>;

// ── Empty defaults ─────────────────────────────────────────────────────────

const emptyState = {
  sequenceId: null as string | null,
  fps: 30,
  durationMs: 0,
  tracks: [] as TimelineTrack[],
  clips: [] as TimelineClip[],
  markers: [] as TimelineMarker[]
};

// ── Store type (with temporal API) ─────────────────────────────────────────

export type TimelineStore = ReturnType<typeof createTimelineStore>;

// ── Factory ────────────────────────────────────────────────────────────────

export const createTimelineStore = (
  initial: Partial<
    Pick<TimelineStoreState, "tracks" | "clips" | "markers" | "durationMs">
  > = {}
) =>
  create<TimelineStoreState>()(
    // @ts-expect-error zundo v2 / zustand v4 types are not fully compatible.
    // Tracked in https://github.com/charkour/zundo/issues — same pattern as NodeStore.ts.
    temporal(
      (set, get) => ({
        ...emptyState,
        ...initial,

        // ── Init ────────────────────────────────────────────────────────────

        loadSequence: (seq) =>
          set({
            sequenceId: seq.id,
            fps: seq.fps,
            durationMs: seq.durationMs,
            tracks: seq.tracks,
            clips: seq.clips,
            markers: seq.markers
          }),

        reset: () => set({ ...emptyState }),

        // ── Tracks ──────────────────────────────────────────────────────────

        addTrack: (type, name) =>
          set((state) => {
            const track = makeTrack({
              type,
              name: name ?? `${type} ${state.tracks.length + 1}`,
              index: state.tracks.length
            });
            return { tracks: [...state.tracks, track] };
          }),

        removeTrack: (trackId) =>
          set((state) => ({
            tracks: state.tracks.filter((t) => t.id !== trackId),
            clips: state.clips.filter((c) => c.trackId !== trackId)
          })),

        reorderTracks: (orderedIds) =>
          set((state) => {
            const byId = new Map(state.tracks.map((t) => [t.id, t]));
            const reordered = orderedIds
              .map((id, index) => {
                const t = byId.get(id);
                return t ? { ...t, index } : null;
              })
              .filter(Boolean) as TimelineTrack[];
            return { tracks: reordered };
          }),

        setTrackHeight: (trackId, heightPx) =>
          set((state) => ({
            tracks: state.tracks.map((t) =>
              t.id === trackId ? { ...t, heightPx } : t
            )
          })),

        setTrackVisible: (trackId, visible) =>
          set((state) => ({
            tracks: state.tracks.map((t) =>
              t.id === trackId ? { ...t, visible } : t
            )
          })),

        setTrackLocked: (trackId, locked) =>
          set((state) => ({
            tracks: state.tracks.map((t) =>
              t.id === trackId ? { ...t, locked } : t
            )
          })),

        setTrackMuted: (trackId, muted) =>
          set((state) => ({
            tracks: state.tracks.map((t) =>
              t.id === trackId ? { ...t, muted } : t
            )
          })),

        setTrackSolo: (trackId, solo) =>
          set((state) => ({
            tracks: state.tracks.map((t) =>
              t.id === trackId ? { ...t, solo } : t
            )
          })),

        setTrackName: (trackId, name) =>
          set((state) => ({
            tracks: state.tracks.map((t) =>
              t.id === trackId ? { ...t, name } : t
            )
          })),

        // ── Clips ───────────────────────────────────────────────────────────

        moveClip: (clipId, deltaMs, toTrackId, snapCandidates, msPerPx, disableSnap) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }

            let newStartMs = Math.max(0, clip.startMs + deltaMs);

            if (!disableSnap && snapCandidates && msPerPx !== undefined) {
              newStartMs = snap(newStartMs, snapCandidates, SNAP_THRESHOLD_PX, msPerPx);
              // Also try snapping the end
              const endSnap = snap(
                newStartMs + clip.durationMs,
                snapCandidates,
                SNAP_THRESHOLD_PX,
                msPerPx
              );
              if (endSnap !== newStartMs + clip.durationMs) {
                newStartMs = endSnap - clip.durationMs;
              }
            }

            newStartMs = Math.max(0, newStartMs);

            return {
              clips: state.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      startMs: newStartMs,
                      trackId: toTrackId ?? c.trackId
                    }
                  : c
              )
            };
          }),

        moveSelectedClips: (
          primaryClipId,
          selectedIds,
          deltaMs,
          toTrackId,
          snapCandidates,
          msPerPx,
          disableSnap
        ) =>
          set((state) => {
            const primary = state.clips.find((c) => c.id === primaryClipId);
            if (!primary) {
              return state;
            }

            // Compute snapped delta based on primary clip
            let snappedDelta = deltaMs;
            if (!disableSnap && snapCandidates && msPerPx !== undefined) {
              const rawStart = Math.max(0, primary.startMs + deltaMs);
              const snappedStart = snap(
                rawStart,
                snapCandidates,
                SNAP_THRESHOLD_PX,
                msPerPx
              );
              snappedDelta = snappedStart - primary.startMs;
            }

            return {
              clips: state.clips.map((c) => {
                if (!selectedIds.has(c.id)) {
                  return c;
                }
                if (c.id === primaryClipId) {
                  return {
                    ...c,
                    startMs: Math.max(0, c.startMs + snappedDelta),
                    trackId: toTrackId ?? c.trackId
                  };
                }
                return {
                  ...c,
                  startMs: Math.max(0, c.startMs + snappedDelta)
                };
              })
            };
          }),

        trimClipStart: (clipId, deltaMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            try {
              const trimmed = trimClip(clip, "start", deltaMs);
              return {
                clips: state.clips.map((c) =>
                  c.id === clipId ? trimmed : c
                )
              };
            } catch {
              // Guard: no-op if trim would produce invalid clip
              return state;
            }
          }),

        trimClipEnd: (clipId, deltaMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            try {
              const trimmed = trimClip(clip, "end", deltaMs);
              return {
                clips: state.clips.map((c) =>
                  c.id === clipId ? trimmed : c
                )
              };
            } catch {
              // Guard: no-op if trim would produce invalid clip
              return state;
            }
          }),

        splitClipAtTime: (clipId, atMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            try {
              const [left, right] = splitClip(clip, atMs);
              const withoutOriginal = state.clips.filter(
                (c) => c.id !== clipId
              );
              return { clips: [...withoutOriginal, left, right] };
            } catch {
              // atMs is outside clip bounds — no-op
              return state;
            }
          }),

        splitSelectedAtPlayhead: (currentTimeMs, selectedIds) =>
          set((state) => {
            // Collect only selected clips that contain the playhead
            let nextClips = [...state.clips];
            const toSplit = nextClips.filter(
              (c) =>
                (selectedIds.size === 0 || selectedIds.has(c.id)) &&
                currentTimeMs > c.startMs &&
                currentTimeMs < c.startMs + c.durationMs
            );
            for (const clip of toSplit) {
              try {
                const [left, right] = splitClip(clip, currentTimeMs);
                nextClips = nextClips
                  .filter((c) => c.id !== clip.id)
                  .concat([left, right]);
              } catch {
                // Skip clips where split is invalid
              }
            }
            return { clips: nextClips };
          }),

        duplicateSelected: (selectedIds, offsetMs = 0) =>
          set((state) => {
            const newClips = state.clips
              .filter((c) => selectedIds.has(c.id))
              .map((c) =>
                makeClip({
                  ...c,
                  id: createTimeOrderedUuid(),
                  startMs: c.startMs + offsetMs
                })
              );
            return { clips: [...state.clips, ...newClips] };
          }),

        deleteSelected: (selectedIds) =>
          set((state) => ({
            clips: state.clips.filter((c) => !selectedIds.has(c.id))
          })),

        deleteClip: (clipId) =>
          set((state) => ({
            clips: state.clips.filter((c) => c.id !== clipId)
          })),

        addClip: (clip) =>
          set((state) => ({
            clips: [...state.clips, clip]
          })),

        patchClip: (clipId, patch) =>
          set((state) => ({
            clips: state.clips.map((c) =>
              c.id === clipId ? { ...c, ...patch } : c
            )
          }))
      }),
      {
        limit: 100,
        partialize: (state): PartializedState => ({
          tracks: state.tracks,
          clips: state.clips,
          markers: state.markers,
          durationMs: state.durationMs
        })
      }
    )
  );

// ── Singleton store ────────────────────────────────────────────────────────

/**
 * The global singleton TimelineStore instance.
 * Use `createTimelineStore` in unit tests for isolation.
 */
export const useTimelineStore = createTimelineStore();

// ── Typed temporal accessor ────────────────────────────────────────────────

/** Access undo / redo / clear on the singleton store. */
export const getTimelineTemporal = (): TemporalState<PartializedState> =>
  (useTimelineStore as unknown as { temporal: { getState: () => TemporalState<PartializedState> } })
    .temporal.getState();

// ── Convenience selectors ──────────────────────────────────────────────────

/** Returns only the clips belonging to a specific track (selector-stable). */
export const useTrackClips = (trackId: string): TimelineClip[] =>
  useTimelineStore(
    (state) => state.clips.filter((c) => c.trackId === trackId),
    // Prevent re-renders when the filtered result contains the same clip objects
    (a, b) => a.length === b.length && a.every((c, i) => c === b[i])
  );

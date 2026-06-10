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
 *   - Undo granularity: the temporal `equality` option dedupes no-op sets so
 *     guard-returns never create history entries, and drag handlers (e.g. in
 *     Clip.tsx) call zundo's `pause()` / `resume()` from the outside so each
 *     drag gesture collapses into a single undo entry.
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
  makeMarker,
  makeTrackEffect,
  createTimeOrderedUuid
} from "@nodetool-ai/timeline";
import type {
  TimelineSequence,
  TimelineTrack,
  TimelineClip,
  TimelineMarker,
  TrackEffect,
  ClipBindingKind,
  TranscriptLine
} from "@nodetool-ai/timeline";
import type { Asset } from "../ApiTypes";
import { assetToClip } from "../../components/timeline/dnd/assetToClipAdapter";
import { trpcClient } from "../../trpc/client";
import { migrateTranscriptToClips, reflowGenerated } from "./transcriptOps";

// ── Snap threshold ─────────────────────────────────────────────────────────

const SNAP_THRESHOLD_PX = 8;

// ── State interface ────────────────────────────────────────────────────────

export interface TimelineStoreState {
  // ── Document ─────────────────────────────────────────────────────────────
  sequenceId: string | null;
  /** Latest server-side `updatedAt` for the loaded sequence; used as the
   * `baseUpdatedAt` optimistic-concurrency token by autosave. */
  baseUpdatedAt: string | null;
  fps: number;
  /** Sequence width in pixels (project resolution). */
  width: number;
  /** Sequence height in pixels (project resolution). */
  height: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  /** Studio transcript lines (document state, persisted + undo-able). */
  transcript: TranscriptLine[];

  // ── Initialisation ───────────────────────────────────────────────────────

  /** Load a full sequence document into the store (replaces all state). */
  loadSequence: (seq: TimelineSequence) => void;
  /** Reset the store to an empty document. */
  reset: () => void;
  /** Roll `baseUpdatedAt` forward after a successful server save. */
  setBaseUpdatedAt: (updatedAt: string) => void;

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

  // ── Track DSP effects ────────────────────────────────────────────────────

  /** Append a new effect of the given type to the track's DSP chain. */
  addTrackEffect: (trackId: string, type: TrackEffect["type"]) => void;
  /** Patch a single effect by id. Type-narrowed at the call site. */
  updateTrackEffect: (
    trackId: string,
    effectId: string,
    patch: Partial<TrackEffect>
  ) => void;
  /** Remove an effect from the track's chain. */
  removeTrackEffect: (trackId: string, effectId: string) => void;
  /** Move an effect within the chain (oldIndex → newIndex). */
  moveTrackEffect: (
    trackId: string,
    oldIndex: number,
    newIndex: number
  ) => void;

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
  trimClipEnd: (
    clipId: string,
    deltaMs: number,
    maxSourceDurationMs?: number
  ) => void;

  /** Split the clip at the given time. The clip must contain that time. */
  splitClipAtTime: (clipId: string, atMs: number) => void;

  /** Split all selected clips at the current playhead (passed as argument). */
  splitSelectedAtPlayhead: (currentTimeMs: number, selectedIds: Set<string>) => void;

  /**
   * Duplicate selected clips. Each duplicate is placed immediately after its
   * source clip (startMs = source.startMs + source.durationMs + offsetMs).
   * Default `offsetMs` of 0 means "right after"; pass a positive value to add
   * a gap between source and duplicate.
   *
   * Returns the IDs of the newly created clips so callers can update selection.
   */
  duplicateSelected: (
    selectedIds: Set<string>,
    offsetMs?: number
  ) => string[];

  /** Delete selected clips. */
  deleteSelected: (selectedIds: Set<string>) => void;

  /** Delete a single clip by ID. */
  deleteClip: (clipId: string) => void;

  /** Add a pre-built clip object directly (used by NOD-304 import). */
  addClip: (clip: TimelineClip) => void;

  /**
   * Create an imported clip from an Asset and insert it into the store.
   * The clip geometry is derived from the asset's content type and duration.
   * Use this action to add clips created by asset drag-and-drop.
   */
  addImportedClip: (asset: Asset, trackId: string, startMs: number) => void;

  /** Update an arbitrary subset of fields on a clip. */
  patchClip: (clipId: string, patch: Partial<TimelineClip>) => void;

  /** Restore a clip to a previously generated version (purely local; autosave persists on next save cycle). */
  restoreVersion: (clipId: string, versionId: string) => void;

  /**
   * Duplicate a clip. Both the source and the duplicate reference the same
   * source workflow id; their `paramOverrides` are independent. Tweak the
   * duplicate's overrides to get a variation.
   *
   * The duplicate is placed immediately after the source clip
   * (startMs = source.startMs + source.durationMs + deltaMs). Default
   * `deltaMs` of 0 means "right after"; pass a positive value for a gap.
   */
  duplicateClip: (clipId: string, deltaMs?: number) => Promise<string>;

  setClipLocked: (clipId: string, locked: boolean) => void;

  replaceClipOutput: (clipId: string, assetId: string) => void;

  /** Mark all clips referencing the given workflowId as stale. */
  markClipsStaleForWorkflow: (workflowId: string) => void;

  /**
   * Update a single Input* node override for a generated clip.
   *
   * Steps:
   *  1. Sets `paramOverrides[inputNodeName] = value`.
   *  2. Marks the clip as "stale" when it has already been generated
   *     (i.e. `lastGeneratedHash` is set), because the new param value means
   *     the current asset no longer matches the current inputs.
   */
  setParamOverride: (
    clipId: string,
    inputNodeName: string,
    value: unknown
  ) => void;

  /**
   * Apply Input* node drift: seed added inputs with defaults, drop removed ones.
   * No status change — caller is responsible for marking stale if needed.
   */
  applyInputDrift: (
    workflowId: string,
    added: Array<{ name: string; defaultValue: unknown }>,
    removed: string[]
  ) => void;

  /**
   * Set `selectedOutputNodeId` for every clip with the given workflowId.
   * Also marks those clips as stale so they will be regenerated.
   */
  setClipsOutputNode: (workflowId: string, selectedOutputNodeId: string) => void;

  /**
   * Create a generated clip bound to `sourceWorkflowId` (no clone) and
   * insert it into the current sequence document. Returns the id of the
   * newly created clip.
   */
  addGeneratedClip: (
    sourceWorkflowId: string,
    trackId: string,
    startMs: number,
    opts?: { selectedOutputNodeId?: string; mediaTypeOverride?: "overlay" }
  ) => Promise<string>;

  /**
   * Create a direct-generation clip (text-to-image / image-to-image) bound
   * to a provider+model+prompt directly — no workflow. The clip is added
   * locally; autosave persists it. Returns the id of the new clip.
   */
  addDirectGenClip: (opts: {
    trackId: string;
    startMs: number;
    durationMs?: number;
    mediaType?: "image" | "video" | "audio" | "overlay";
    bindingKind?:
      | "text-to-image"
      | "image-to-image"
      | "text-to-video"
      | "text-to-audio";
    prompt: string;
    provider?: string;
    model?: string;
    voice?: string;
    sourceClipId?: string | null;
    width?: number;
    height?: number;
    strength?: number;
    numInferenceSteps?: number;
    name?: string;
  }) => string;

  /** Update a direct-gen clip's prompt. Marks the clip stale if already generated. */
  setClipPrompt: (clipId: string, prompt: string) => void;

  /** Update a direct-gen clip's provider + model. Marks stale if already generated. */
  setClipDirectGenModel: (
    clipId: string,
    provider: string,
    model: string
  ) => void;

  /** Update arbitrary direct-gen binding fields on a clip. Marks stale when applicable. */
  patchClipBinding: (
    clipId: string,
    patch: Partial<
      Pick<
        TimelineClip,
        | "bindingKind"
        | "prompt"
        | "negativePrompt"
        | "provider"
        | "model"
        | "voice"
        | "sourceClipId"
        | "width"
        | "height"
        | "strength"
        | "numInferenceSteps"
        | "seed"
      >
    >
  ) => void;

  /**
   * "Regenerate as a new clip" — duplicates the clip immediately to the
   * right, preserving its full binding (workflow + paramOverrides, OR
   * direct-gen prompt + model). The new clip starts in `draft` so the
   * caller can immediately kick off `useGenerateClip(newClipId)`.
   *
   * The original clip is left untouched — useful when a clip has been
   * split and you want a fresh roll without losing the existing render.
   */
  regenerateAsCopy: (clipId: string, deltaMs?: number) => string;

  /**
   * Atomically replace any of the transcript / clips / duration document
   * slices in a single store update (one undo entry). Studio transcript ops
   * compute the next document with pure helpers and commit it here so a
   * delete-line + clip-removal + re-flow lands as one coherent edit.
   */
  setTranscriptAndClips: (patch: {
    transcript?: TranscriptLine[];
    clips?: TimelineClip[];
    durationMs?: number;
  }) => void;

  /** Append a timeline marker (e.g. a scene boundary) at the given time. */
  addMarker: (timeMs: number, label?: string) => void;

  /** Remove the marker with the given id. */
  removeMarker: (id: string) => void;

  /**
   * Merge clip halves that were split at `timeMs` back into single clips — the
   * inverse of {@link splitClipAtTime}. Per track, a left clip ending at `timeMs`
   * and a right clip starting at `timeMs` that are contiguous in the same source
   * (`right.inPointMs === left.outPointMs`, same asset) collapse into one.
   */
  mergeClipsAt: (timeMs: number) => void;

  /**
   * Drop a scene boundary at `timeMs`: add a marker AND split every clip there,
   * as a SINGLE undo step. Inverse of {@link removeScene}.
   */
  addScene: (timeMs: number, label?: string) => void;

  /**
   * Remove a scene's marker AND merge back the clip it split, as a SINGLE undo
   * step. A no-op merge is harmless for non-scene markers.
   */
  removeScene: (markerId: string) => void;
}

// ── Partialized type for zundo (only document state is undo-able) ──────────

type PartializedState = Pick<
  TimelineStoreState,
  "tracks" | "clips" | "markers" | "durationMs" | "transcript"
>;

// ── Temporal equality (dedupe no-op sets) ───────────────────────────────────

/** Shallow per-key equality for plain records (one level of `Object.is`). */
function shallowRecordEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keysA = Object.keys(recA);
  const keysB = Object.keys(recB);
  return (
    keysA.length === keysB.length &&
    keysA.every((k) => Object.is(recA[k], recB[k]))
  );
}

/** Element-wise array equality, comparing items shallowly. */
function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((item, i) => shallowRecordEqual(item, b[i])))
  );
}

/**
 * zundo `equality`: returns true when two partialized snapshots are
 * equivalent, so no-op sets (guard-returns, `{}` patches, value-identical
 * remaps) don't push duplicate undo entries.
 */
function partializedEqual(
  pastState: PartializedState,
  currentState: PartializedState
): boolean {
  return (
    pastState.durationMs === currentState.durationMs &&
    shallowArrayEqual(pastState.tracks, currentState.tracks) &&
    shallowArrayEqual(pastState.clips, currentState.clips) &&
    shallowArrayEqual(pastState.markers, currentState.markers) &&
    shallowArrayEqual(pastState.transcript, currentState.transcript)
  );
}

// ── Scene split/merge helpers (pure) ───────────────────────────────────────

/** Split every clip that strictly contains `timeMs` into two halves. */
function splitAllClipsAt(
  clips: TimelineClip[],
  timeMs: number
): TimelineClip[] {
  let next = [...clips];
  const toSplit = next.filter(
    (c) => timeMs > c.startMs && timeMs < c.startMs + c.durationMs
  );
  for (const clip of toSplit) {
    try {
      const [left, right] = splitClip(clip, timeMs);
      next = next.filter((c) => c.id !== clip.id).concat([left, right]);
    } catch {
      // Skip clips where the split is invalid (e.g. boundary mismatch).
    }
  }
  return next;
}

/**
 * Merge clip halves split at `timeMs` back into single clips — inverse of
 * `splitClip`. Returns the same array reference when nothing merges.
 */
function mergeClipsAtTime(
  clips: TimelineClip[],
  timeMs: number
): TimelineClip[] {
  const EPS = 1;
  const removed = new Set<string>();
  const replaced = new Map<string, TimelineClip>();
  for (const right of clips) {
    if (removed.has(right.id)) continue;
    if (Math.abs(right.startMs - timeMs) > EPS) continue;
    const left = clips.find(
      (c) =>
        c.id !== right.id &&
        !removed.has(c.id) &&
        c.trackId === right.trackId &&
        c.currentAssetId === right.currentAssetId &&
        Math.abs(c.startMs + c.durationMs - timeMs) <= EPS &&
        // Source contiguity: the left half's source out-point must meet the
        // right half's source in-point. Use outPointMs (set on every split half)
        // rather than inPointMs + durationMs, which only holds at 1× speed.
        Math.abs(
          (c.outPointMs ?? (c.inPointMs ?? 0) + c.durationMs) -
            (right.inPointMs ?? 0)
        ) <= EPS
    );
    if (!left) continue;
    const base = replaced.get(left.id) ?? left;
    replaced.set(left.id, {
      ...base,
      durationMs: base.durationMs + right.durationMs,
      outPointMs:
        right.outPointMs ??
        (base.inPointMs ?? 0) + base.durationMs + right.durationMs
    });
    removed.add(right.id);
  }
  if (removed.size === 0) return clips;
  return clips
    .filter((c) => !removed.has(c.id))
    .map((c) => replaced.get(c.id) ?? c);
}

// ── Empty defaults ─────────────────────────────────────────────────────────

const emptyState: {
  sequenceId: string | null;
  baseUpdatedAt: string | null;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  transcript: TranscriptLine[];
} = {
  sequenceId: null,
  baseUpdatedAt: null,
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  tracks: [],
  clips: [],
  markers: [],
  transcript: []
};

// ── Factory ────────────────────────────────────────────────────────────────

export const createTimelineStore = (
  initial: Partial<
    Pick<TimelineStoreState, "tracks" | "clips" | "markers" | "durationMs">
  > = {}
) =>
  create<TimelineStoreState>()(
    temporal(
      (set, get) => ({
        ...emptyState,
        ...initial,

        // ── Init ────────────────────────────────────────────────────────────

        loadSequence: (seq) => {
          const transcript = seq.transcript ?? [];

          // Legacy sequences stored the transcript as `TranscriptLine[]` binding
          // a voiceover clip + a separate caption clip. Fold those words onto
          // the voiceover clips so clips become the single source of truth; the
          // transcript field is then cleared (and stays empty going forward).
          if (transcript.length > 0) {
            let tracks = seq.tracks;
            let audioTrack = tracks.find((t) => t.type === "audio");
            if (!audioTrack) {
              audioTrack = makeTrack({
                type: "audio",
                name: "Voiceover",
                index: tracks.length
              });
              tracks = [...tracks, audioTrack];
            }
            const migrated = migrateTranscriptToClips(
              transcript,
              seq.clips,
              audioTrack.id
            );
            const { clips, durationMs } = reflowGenerated(migrated);
            set({
              sequenceId: seq.id,
              baseUpdatedAt: seq.updatedAt,
              fps: seq.fps,
              width: seq.width,
              height: seq.height,
              durationMs: Math.max(seq.durationMs, durationMs),
              tracks,
              clips,
              markers: seq.markers,
              transcript: []
            });
            return;
          }

          set({
            sequenceId: seq.id,
            baseUpdatedAt: seq.updatedAt,
            fps: seq.fps,
            width: seq.width,
            height: seq.height,
            durationMs: seq.durationMs,
            tracks: seq.tracks,
            clips: seq.clips,
            markers: seq.markers,
            transcript: []
          });
        },

        reset: () => set({ ...emptyState }),

        setBaseUpdatedAt: (updatedAt) => set({ baseUpdatedAt: updatedAt }),

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
              .filter((t): t is TimelineTrack => t !== null);
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

        // ── Track DSP effects ─────────────────────────────────────────────

        addTrackEffect: (trackId, type) =>
          set((state) => ({
            tracks: state.tracks.map((t) => {
              if (t.id !== trackId) return t;
              const effects = [...(t.effects ?? []), makeTrackEffect(type)];
              return { ...t, effects };
            })
          })),

        updateTrackEffect: (trackId, effectId, patch) =>
          set((state) => ({
            tracks: state.tracks.map((t) => {
              if (t.id !== trackId) return t;
              const effects = (t.effects ?? []).map((e) =>
                e.id === effectId
                  ? ({ ...e, ...patch } as TrackEffect)
                  : e
              );
              return { ...t, effects };
            })
          })),

        removeTrackEffect: (trackId, effectId) =>
          set((state) => ({
            tracks: state.tracks.map((t) => {
              if (t.id !== trackId) return t;
              const effects = (t.effects ?? []).filter(
                (e) => e.id !== effectId
              );
              return { ...t, effects };
            })
          })),

        moveTrackEffect: (trackId, oldIndex, newIndex) =>
          set((state) => ({
            tracks: state.tracks.map((t) => {
              if (t.id !== trackId) return t;
              const effects = [...(t.effects ?? [])];
              if (
                oldIndex < 0 ||
                oldIndex >= effects.length ||
                newIndex < 0 ||
                newIndex >= effects.length ||
                oldIndex === newIndex
              ) {
                return t;
              }
              const [moved] = effects.splice(oldIndex, 1);
              effects.splice(newIndex, 0, moved);
              return { ...t, effects };
            })
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

            // Clamp the delta ONCE for the whole group so relative spacing is
            // preserved when the selection is dragged against t=0.
            const minStartMs = state.clips.reduce(
              (min, c) => (selectedIds.has(c.id) ? Math.min(min, c.startMs) : min),
              primary.startMs
            );
            const effectiveDelta = Math.max(snappedDelta, -minStartMs);

            return {
              clips: state.clips.map((c) => {
                if (!selectedIds.has(c.id)) {
                  return c;
                }
                if (c.id === primaryClipId) {
                  return {
                    ...c,
                    startMs: c.startMs + effectiveDelta,
                    trackId: toTrackId ?? c.trackId
                  };
                }
                return {
                  ...c,
                  startMs: c.startMs + effectiveDelta
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

        trimClipEnd: (clipId, deltaMs, maxSourceDurationMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            try {
              // Clamp grow deltas so that outPointMs cannot exceed source
              // duration. Never clamp a shrink — an over-extended clip
              // (outPointMs already past source end) must still shrink.
              let clampedDelta = deltaMs;
              if (maxSourceDurationMs !== undefined && deltaMs > 0) {
                const currentOutPointMs =
                  clip.outPointMs ?? (clip.inPointMs ?? 0) + clip.durationMs;
                const maxGrow = maxSourceDurationMs - currentOutPointMs;
                clampedDelta = Math.min(deltaMs, Math.max(0, maxGrow));
              }
              const trimmed = trimClip(clip, "end", clampedDelta);
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

        duplicateSelected: (selectedIds, offsetMs = 0) => {
          const newIds: string[] = [];
          set((state) => {
            const newClips = state.clips
              .filter((c) => selectedIds.has(c.id))
              .map((c) => {
                const id = createTimeOrderedUuid();
                newIds.push(id);
                return makeClip({
                  ...c,
                  id,
                  startMs: c.startMs + c.durationMs + offsetMs
                });
              });
            return { clips: [...state.clips, ...newClips] };
          });
          return newIds;
        },

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

        addImportedClip: (asset, trackId, startMs) => {
          const clip = assetToClip(asset, trackId, startMs);
          set((state) => ({ clips: [...state.clips, clip] }));
        },

        patchClip: (clipId, patch) =>
          set((state) => ({
            clips: state.clips.map((c) =>
              c.id === clipId ? { ...c, ...patch } : c
            )
          })),

        restoreVersion: (clipId, versionId) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return state;
            const version = (clip.versions ?? []).find(
              (v) => v.id === versionId
            );
            if (!version || version.status !== "success") return state;

            const restoredHash = version.dependencyHash;
            const status: TimelineClip["status"] =
              clip.dependencyHash === restoredHash ? "generated" : "stale";

            return {
              clips: state.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      currentAssetId: version.assetId,
                      paramOverrides: version.paramOverridesSnapshot,
                      lastGeneratedHash: restoredHash,
                      status
                    }
                  : c
              )
            };
          }),

        duplicateClip: async (clipId, deltaMs = 0) => {
          const src = get().clips.find((c) => c.id === clipId);
          if (!src) {
            throw new Error(`Clip ${clipId} not found`);
          }

          let newClipId: string | undefined;
          set((state) => {
            const currentSrc = state.clips.find((c) => c.id === clipId);
            if (!currentSrc) {
              return state;
            }
            const newClip = makeClip({
              ...currentSrc,
              id: createTimeOrderedUuid(),
              startMs: currentSrc.startMs + currentSrc.durationMs + deltaMs,
              workflowId: currentSrc.workflowId,
              paramOverrides: currentSrc.paramOverrides
                ? structuredClone(currentSrc.paramOverrides)
                : undefined,
              status: "draft",
              locked: false,
              currentAssetId: undefined,
              lastGeneratedHash: undefined,
              versions: []
            });
            newClipId = newClip.id;
            return { clips: [...state.clips, newClip] };
          });

          if (!newClipId) {
            throw new Error(
              `Source clip ${clipId} was deleted before duplicate could be created`
            );
          }
          return newClipId;
        },

        setClipLocked: (clipId, locked) =>
          set((state) => ({
            clips: state.clips.map((c) =>
              c.id === clipId ? { ...c, locked } : c
            )
          })),

        replaceClipOutput: (clipId, assetId) =>
          set((state) => ({
            clips: state.clips.map((c) =>
              c.id === clipId ? { ...c, currentAssetId: assetId } : c
            )
          })),

        markClipsStaleForWorkflow: (workflowId) =>
          set((state) => ({
            clips: state.clips.map((c) =>
              c.workflowId === workflowId ? { ...c, status: "stale" } : c
            )
          })),

        setParamOverride: (clipId, inputNodeName, value) =>
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.id !== clipId) return c;
              const paramOverrides = { ...(c.paramOverrides ?? {}), [inputNodeName]: value };
              // Mark as stale only when the clip has already been generated.
              const status: TimelineClip["status"] =
                c.lastGeneratedHash ? "stale" : c.status;
              return { ...c, paramOverrides, status };
            })
          })),

        applyInputDrift: (workflowId, added, removed) =>
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.workflowId !== workflowId) return c;
              const overrides = { ...(c.paramOverrides ?? {}) };
              for (const { name, defaultValue } of added) {
                if (!(name in overrides)) {
                  overrides[name] = defaultValue;
                }
              }
              for (const name of removed) {
                delete overrides[name];
              }
              return { ...c, paramOverrides: overrides };
            })
          })),

        setClipsOutputNode: (workflowId, selectedOutputNodeId) =>
          set((state) => ({
            clips: state.clips.map((c) =>
              c.workflowId === workflowId
                ? { ...c, selectedOutputNodeId, status: "stale" }
                : c
            )
          })),

        addGeneratedClip: async (sourceWorkflowId, trackId, startMs, opts) => {
          const sequenceId = get().sequenceId;
          if (!sequenceId) {
            throw new Error("No timeline sequence loaded");
          }

          const newClip = await trpcClient.timeline.clips.create.mutate({
            id: sequenceId,
            trackId,
            startMs,
            sourceWorkflowId,
            selectedOutputNodeId: opts?.selectedOutputNodeId,
            mediaTypeOverride: opts?.mediaTypeOverride
          });

          set((state) => ({
            clips: [...state.clips, newClip]
          }));

          return newClip.id;
        },

        addDirectGenClip: (opts) => {
          const bindingKind: ClipBindingKind = opts.bindingKind ?? "text-to-image";
          const mediaType = opts.mediaType ?? "image";
          const durationMs = opts.durationMs ?? 4000;
          const trimmedPrompt = opts.prompt.trim();
          const fallbackName =
            trimmedPrompt.length > 0
              ? trimmedPrompt.slice(0, 40)
              : bindingKind === "image-to-image"
                ? "Image-to-Image"
                : bindingKind === "text-to-video"
                  ? "Text-to-Video"
                  : bindingKind === "text-to-audio"
                    ? "Text-to-Audio"
                    : "Text-to-Image";

          const clip = makeClip({
            id: createTimeOrderedUuid(),
            name: opts.name ?? fallbackName,
            trackId: opts.trackId,
            startMs: opts.startMs,
            durationMs,
            mediaType,
            sourceType: "generated",
            bindingKind,
            prompt: opts.prompt,
            provider: opts.provider,
            model: opts.model,
            voice: opts.voice,
            sourceClipId: opts.sourceClipId ?? null,
            width: opts.width,
            height: opts.height,
            strength: opts.strength,
            numInferenceSteps: opts.numInferenceSteps,
            status: "draft",
            locked: false,
            versions: []
          });

          set((state) => ({ clips: [...state.clips, clip] }));
          return clip.id;
        },

        setClipPrompt: (clipId, prompt) =>
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.id !== clipId) return c;
              // Mark stale once a render exists, so the inspector hints "regenerate".
              const status: TimelineClip["status"] =
                c.lastGeneratedHash || c.currentAssetId ? "stale" : c.status;
              return { ...c, prompt, status };
            })
          })),

        setClipDirectGenModel: (clipId, provider, model) =>
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.id !== clipId) return c;
              const status: TimelineClip["status"] =
                c.lastGeneratedHash || c.currentAssetId ? "stale" : c.status;
              return { ...c, provider, model, status };
            })
          })),

        patchClipBinding: (clipId, patch) =>
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.id !== clipId) return c;
              const status: TimelineClip["status"] =
                c.lastGeneratedHash || c.currentAssetId ? "stale" : c.status;
              return { ...c, ...patch, status };
            })
          })),

        regenerateAsCopy: (clipId, deltaMs = 0) => {
          let newId: string | undefined;
          set((state) => {
            const src = state.clips.find((c) => c.id === clipId);
            if (!src) return state;
            const clone = makeClip({
              ...src,
              id: createTimeOrderedUuid(),
              startMs: src.startMs + src.durationMs + deltaMs,
              // Clone independent overrides / binding so edits diverge.
              paramOverrides: src.paramOverrides
                ? structuredClone(src.paramOverrides)
                : undefined,
              // Reset render state so it generates fresh.
              status: "draft",
              locked: false,
              currentAssetId: undefined,
              lastGeneratedHash: undefined,
              inPointMs: undefined,
              outPointMs: undefined,
              versions: []
            });
            newId = clone.id;
            return { clips: [...state.clips, clone] };
          });
          if (!newId) {
            throw new Error(`Clip ${clipId} not found`);
          }
          return newId;
        },

        setTranscriptAndClips: (patch) =>
          set((state) => ({
            transcript: patch.transcript ?? state.transcript,
            clips: patch.clips ?? state.clips,
            durationMs: patch.durationMs ?? state.durationMs
          })),

        addMarker: (timeMs, label) =>
          set((state) => ({
            markers: [
              ...state.markers,
              makeMarker({
                timeMs: Math.max(0, Math.round(timeMs)),
                label: label ?? ""
              })
            ]
          })),

        removeMarker: (id) =>
          set((state) => ({
            markers: state.markers.filter((m) => m.id !== id)
          })),

        mergeClipsAt: (timeMs) =>
          set((state) => {
            const next = mergeClipsAtTime(state.clips, timeMs);
            return next === state.clips ? {} : { clips: next };
          }),

        addScene: (timeMs, label) =>
          set((state) => ({
            markers: [
              ...state.markers,
              makeMarker({
                timeMs: Math.max(0, Math.round(timeMs)),
                label: label ?? ""
              })
            ],
            clips: splitAllClipsAt(state.clips, Math.round(timeMs))
          })),

        removeScene: (markerId) =>
          set((state) => {
            const marker = state.markers.find((m) => m.id === markerId);
            const markers = state.markers.filter((m) => m.id !== markerId);
            return {
              markers,
              clips: marker
                ? mergeClipsAtTime(state.clips, marker.timeMs)
                : state.clips
            };
          })
      }),
      {
        limit: 100,
        equality: partializedEqual,
        partialize: (state): PartializedState => ({
          tracks: state.tracks,
          clips: state.clips,
          markers: state.markers,
          durationMs: state.durationMs,
          transcript: state.transcript
        })
      }
    )
  );

// ── Store handle type ───────────────────────────────────────────────────────

/** A single timeline-document store instance (with its zundo `temporal`). */
export type TimelineStoreApi = ReturnType<typeof createTimelineStore>;

/** Read the zundo temporal (undo/redo) state of a given store instance. */
export const timelineTemporalOf = (
  store: TimelineStoreApi
): TemporalState<PartializedState> =>
  (
    store as unknown as {
      temporal: { getState: () => TemporalState<PartializedState> };
    }
  ).temporal.getState();

export type { PartializedState as TimelinePartializedState };

// The context-bound `useTimelineStore` hook and the active-instance
// `getTimelineTemporal` accessor are defined against the surrounding instance
// in the instance module and re-exported so existing imports keep resolving
// from this path.
export {
  useTimelineStore,
  useTimelineStoreApi,
  getTimelineTemporal
} from "./TimelineInstance";


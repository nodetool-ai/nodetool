/**
 * TimelineStore
 *
 * Central Zustand store (with temporal undo/redo middleware) for the timeline sequence document.
 * Mirrors NodeStore's undo/redo wiring (temporal middleware, partialize).
 *
 * Responsibilities:
 *   - Holds an in-memory copy of the TimelineSequence document
 *     (tracks + clips + markers).
 *   - Exposes pure-reducer actions: move, trim, split, duplicate, delete,
 *     addTrack, insertTrack, duplicateTrack, removeTrack, reorderTracks,
 *     setTrackHeight.
 *   - Undo granularity: the temporal `equality` option dedupes no-op sets so
 *     guard-returns never create history entries, and drag handlers (e.g. in
 *     Clip.tsx) call the temporal middleware's `pause()` / `resume()` from the outside so each
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
import { temporal } from "../temporal";
import type { TemporalState } from "../temporal";
import {
  groupDescendantIds,
  isGroupClip,
  moveGroup,
  splitClip,
  trimClip,
  rippleTrim,
  rollEdit,
  rippleDelete,
  closeGap,
  resolveDrop,
  applyTransitionAtCut,
  removeTransitionAtCut,
  DEFAULT_TRANSITION_MS,
  setKeyframe,
  removeKeyframe,
  trimGroup,
  ungroup,
  snap,
  makeTrack,
  makeClip,
  makeMarker,
  makeTrackEffect,
  createTimeOrderedUuid,
  createMidiNote,
  quantizeNotes,
  rescaleClipsForTempo,
  DEFAULT_TEMPO,
  resolveTempo,
  scaleVelocity,
  sortNotes,
  transposeNotes,
  DEFAULT_MIDI_INSTRUMENT,
  clearGeneratedMatte as clearMatteOnClip,
  selectGeneratedMatteVersion as selectMatteVersionOnClip
} from "@nodetool-ai/timeline";
import type {
  AnimatedProperty,
  DropMode,
  QuantizeOptions
} from "@nodetool-ai/timeline";
import type {
  TimelineSequence,
  TimelineTrack,
  TimelineClip,
  TimelineMarker,
  TrackEffect,
  ClipBindingKind,
  ClipAnimation,
  ClipGeneratedMatte,
  MidiInstrument,
  MidiNote,
  TimelineTempo,
  TranscriptLine,
  TimelineBeat,
  TimelineSetup
} from "@nodetool-ai/timeline";
import type { Asset } from "../ApiTypes";
import { assetToClip } from "../../components/timeline/dnd/assetToClipAdapter";
import { useLastModelStore, modelKindForBinding } from "../lastModelStore";
import { trpcClient } from "../../trpc/client";
import { buildTimelineDocumentPayload } from "../../hooks/timeline/timelineDocumentPayload";
import {
  bakeAudioAnimation as postAudioAnimationBake,
  type BakeAudioAnimationBody,
  type BakeAudioAnimationResult
} from "../../utils/timelineAudioBake";
import {
  isolateSubject as postIsolateSubject,
  type IsolateSubjectBody,
  type IsolateSubjectResult
} from "../../utils/timelineIsolateSubject";
import { useNotificationStore } from "../NotificationStore";
import { cloneClipsToTrack } from "./clipboardOps";
import {
  migrateTranscriptToClips,
  reflowGenerated,
  isTranscriptClip
} from "./transcriptOps";
import { mergeTimelineDocuments, type TimelineMergeDoc } from "./merge";
import type { DocumentOp } from "@nodetool-ai/protocol";

// ── Snap threshold ─────────────────────────────────────────────────────────

const SNAP_THRESHOLD_PX = 8;

// ── Generated matte ────────────────────────────────────────────────────────

/** How long between polls of a running isolate-subject generation. */
const MATTE_POLL_INTERVAL_MS = 3_000;
/** How long to wait for one before leaving the clip as the server has it. */
const MATTE_POLL_TIMEOUT_MS = 10 * 60_000;

/**
 * What {@link TimelineStoreState.isolateSubject} runs with: the endpoint's own
 * knobs, plus the two timings the poll uses (named so a test does not have to
 * wait out a real interval).
 */
export interface IsolateSubjectOptions
  extends Omit<IsolateSubjectBody, "clip_id"> {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ── State interface ────────────────────────────────────────────────────────

/** What {@link TimelineStoreState.addMarker} places. */
export interface TimelineMarkerInput {
  timeMs: number;
  label?: string;
  color?: string;
  note?: string;
}

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
  /**
   * Whether the script feature (transcript lane + transcript panel) is shown.
   * Single source of truth, always a definite boolean post-normalization.
   */
  scriptEnabled: boolean;
  /**
   * The document's constant tempo. Absent means `DEFAULT_TEMPO` (120 BPM,
   * 4/4, beat one at 0) — `resolveTempo` is the one place that decides, so a
   * document written before midi existed reads the same everywhere.
   */
  tempo?: TimelineTempo;
  /**
   * Guided video-flow state (PRD § 8.5). Null on every sequence not built
   * through the flow, which is what makes those open straight in the editor.
   * Document state — it is persisted with the document — but deliberately
   * outside the undo partialize: Ctrl+Z belongs to the cut, not to the wizard.
   */
  setup: TimelineSetup | null;
  /**
   * Linked selection: a clip's linked siblings (a video and its extracted
   * audio) move and trim with it. Editor state, not part of the document.
   */
  linkedSelection: boolean;
  /**
   * The document as the editor last read or wrote it — the merge base for an
   * external change into a dirty draft. Refreshed by `loadSequence` and by
   * `setBaseUpdatedAt` (which only autosave calls after a landed write).
   */
  syncedDocument: {
    tracks: TimelineTrack[];
    clips: TimelineClip[];
    markers: TimelineMarker[];
    transcript: TranscriptLine[];
    scriptEnabled: boolean;
    fps: number;
    width: number;
    height: number;
  } | null;

  // ── Initialisation ───────────────────────────────────────────────────────

  /** Load a full sequence document into the store (replaces all state). */
  loadSequence: (seq: TimelineSequence) => void;
  /**
   * Apply a document merged with an external change. Callers pause the
   * temporal middleware around it so no undo entry is recorded (ADR 0001).
   * Clips are reflowed and `durationMs` recomputed after the patch.
   */
  applyExternalMerge: (patch: {
    tracks?: TimelineTrack[];
    clips?: TimelineClip[];
    markers?: TimelineMarker[];
    transcript?: TranscriptLine[];
    scriptEnabled?: boolean;
    fps?: number;
    width?: number;
    height?: number;
  }) => void;
  /**
   * Write back the document `applyTimelineOp` returned, in one `set` so one
   * agent tool call is one undo entry. Clips are reflowed and `durationMs`
   * recomputed, as `applyExternalMerge` does.
   */
  applyAgentEdit: (next: {
    tracks: TimelineTrack[];
    clips: TimelineClip[];
    markers: TimelineMarker[];
  }) => void;
  /** Reset the store to an empty document. */
  reset: () => void;
  /**
   * Roll `baseUpdatedAt` forward after a successful server save, snapshotting
   * the current document as the next merge base — or an explicit server
   * snapshot when the caller has one (an external merge must record what the
   * server holds, never the dirty draft it produced).
   */
  setBaseUpdatedAt: (
    updatedAt: string,
    synced?: NonNullable<TimelineStoreState["syncedDocument"]> | null
  ) => void;
  /** Show or hide the script feature (non-destructive; does not touch clips). */
  setScriptEnabled: (enabled: boolean) => void;
  /**
   * Write the guided flow's state. Fields you pass replace what is stored;
   * the rest is left alone. The first write on a sequence with no setup starts
   * one at stage `idea` with an empty brief.
   */
  setSetup: (
    patch: Partial<
      Pick<TimelineSetup, "stage" | "brief" | "format" | "beats" | "voiceover">
    >
  ) => void;
  /**
   * Change one beat of the plan. Undefined fields are left alone; an explicit
   * `null` transition clears it. A beat id that is not in the plan is a no-op.
   */
  updateBeat: (
    beatId: string,
    patch: Partial<Omit<TimelineBeat, "id">> & { transition?: string | null }
  ) => void;
  /**
   * Drop one beat from the plan. The review tells a creator to remove a beat
   * that does not earn its length, so there is an operation that does it. A
   * beat id that is not in the plan is a no-op.
   */
  removeBeat: (beatId: string) => void;
  setLinkedSelection: (on: boolean) => void;

  /**
   * Patch the project settings — canvas resolution (`width`/`height`) and frame
   * rate (`fps`). These drive the preview compositor's reference size and the
   * export render dimensions/frame stepping. Persisted via the
   * `timeline.update` top-level fields (not the document), so they are not part
   * of the undo history. A patch that changes nothing is a no-op.
   */
  setProjectSettings: (patch: {
    fps?: number;
    width?: number;
    height?: number;
  }) => void;

  // ── Track mutations ──────────────────────────────────────────────────────

  addTrack: (type: TimelineTrack["type"], name?: string) => void;
  /**
   * Insert a new track at `atIndex` (clamped to 0..tracks.length) and
   * renumber `index` on every track. Returns the new track id.
   */
  insertTrack: (
    type: TimelineTrack["type"],
    atIndex: number,
    name?: string
  ) => string;
  /**
   * Copy a track (fresh id, "<name> copy", same settings, effects re-id'd)
   * right after the source, with every clip on it copied under fresh ids.
   * Returns the new track id, or null when `trackId` is unknown.
   */
  duplicateTrack: (trackId: string) => string | null;
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

  // ── MIDI ─────────────────────────────────────────────────────────────────

  /**
   * Set the document tempo and rescale the midi clips for it (through
   * `rescaleClipsForTempo`, from the tempo the document is currently read at).
   * Clips that are not midi keep their position: milliseconds are the master
   * clock and a picture cut is where the editor put it. One undo entry.
   */
  setTempo: (tempo: TimelineTempo) => void;
  /** Set the synth a midi track plays. Every clip on the track uses it. */
  setTrackInstrument: (trackId: string, instrument: MidiInstrument) => void;
  /**
   * Place a midi clip and return its id. The notes ride inside the clip in
   * ticks from its content start; ids and velocities are filled in by
   * `createMidiNote`.
   */
  addMidiClip: (opts: {
    trackId: string;
    startMs: number;
    durationMs: number;
    name?: string;
    notes?: Array<
      Pick<MidiNote, "pitch" | "startTick" | "durationTick"> & Partial<MidiNote>
    >;
  }) => string;
  /** Replace a midi clip's whole note list. */
  setClipNotes: (
    clipId: string,
    notes: Array<
      Pick<MidiNote, "pitch" | "startTick" | "durationTick"> & Partial<MidiNote>
    >
  ) => void;
  /**
   * Move every note in a midi clip by whole semitones, clamped to the 0..127
   * MIDI range. Ids survive, so the selection still points at the same notes.
   * One undo entry; a non-midi clip and a zero shift are both no-ops.
   */
  transposeClip: (clipId: string, semitones: number) => void;
  /**
   * Snap a midi clip's onsets — and, with `target: "start_and_length"`, its
   * held lengths — to a note grid. Ticks are the grid, so the result does not
   * depend on the document tempo. One undo entry.
   */
  quantizeClip: (clipId: string, options: QuantizeOptions) => void;
  /**
   * Scale how hard every note in a midi clip is struck, clamped to 1..127.
   * One undo entry.
   */
  scaleClipVelocity: (clipId: string, factor: number) => void;

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

  /**
   * Trim an edge and ripple: every clip on an unlocked track that started at
   * or after the clip's old end moves by the change in duration. Same delta
   * convention as trimClipStart/trimClipEnd. A start-edge ripple keeps the
   * clip parked at its startMs. Invalid trims no-op.
   */
  rippleTrimClipStart: (clipId: string, deltaMs: number) => void;
  rippleTrimClipEnd: (
    clipId: string,
    deltaMs: number,
    maxSourceDurationMs?: number
  ) => void;

  /**
   * Roll the cut on one edge of a clip: the neighbour across the cut gives up
   * what this clip gains. Positive delta moves the cut later. No-ops when the
   * edge has no neighbour or either side runs out of source.
   */
  rollClipEdge: (
    clipId: string,
    edge: "start" | "end",
    deltaMs: number
  ) => void;

  /** Delete the selection and close the time it covered on unlocked tracks. */
  rippleDeleteSelected: (selectedIds: Set<string>) => void;

  /** Close the empty stretch on `trackId` containing `timeMs`. */
  closeGapAt: (trackId: string, timeMs: number) => void;

  /**
   * Settle a finished drop: overwrite what the moved clips cover, insert and
   * push everything right, or leave the overlap for the renderer.
   */
  resolveDrop: (movedIds: ReadonlySet<string>, mode: DropMode) => void;

  /**
   * Cross-fade into each clip: its abutting predecessor is extended under it
   * by the transition length so the dissolve has two pictures. A clip that
   * already carries a transition keeps its type. One undo step.
   */
  applyDefaultTransition: (clipIds: ReadonlySet<string>, durationMs?: number) => void;
  /** Resize a clip's incoming transition, growing the predecessor as needed. */
  setTransitionDuration: (clipId: string, durationMs: number) => void;
  removeTransition: (clipId: string) => void;

  /** Keyframe `property` at a clip-relative time (see `keyframes.ts`). */
  setClipKeyframe: (
    clipId: string,
    property: AnimatedProperty,
    atMs: number,
    value: number
  ) => void;
  removeClipKeyframe: (
    clipId: string,
    property: AnimatedProperty,
    atMs: number
  ) => void;

  /**
   * Add the marked range of an asset as a clip (three-point editing from the
   * source viewer). Returns the new clip's id.
   */
  addSourceRange: (
    asset: Asset,
    trackId: string,
    startMs: number,
    inMs: number,
    outMs: number
  ) => string;

  /** Split the clip at the given time. The clip must contain that time. */
  splitClipAtTime: (clipId: string, atMs: number) => void;

  /** Split all selected clips at the current playhead (passed as argument). */
  splitSelectedAtPlayhead: (
    currentTimeMs: number,
    selectedIds: Set<string>
  ) => void;

  /**
   * Duplicate selected clips. Each duplicate is placed immediately after its
   * source clip (startMs = source.startMs + source.durationMs + offsetMs).
   * Default `offsetMs` of 0 means "right after"; pass a positive value to add
   * a gap between source and duplicate.
   *
   * Returns the IDs of the newly created clips so callers can update selection.
   */
  duplicateSelected: (selectedIds: Set<string>, offsetMs?: number) => string[];

  /** Delete selected clips. */
  deleteSelected: (selectedIds: Set<string>) => void;

  /** Delete a single clip by ID. */
  deleteClip: (clipId: string) => void;

  /** Add a pre-built clip object directly (used by NOD-304 import). */
  addClip: (clip: TimelineClip) => void;

  /** Add several pre-built clips in one update (one undo entry) — paste. */
  addClips: (clips: TimelineClip[]) => void;

  /**
   * Return the id of an audio track to drop an audio clip onto, creating one
   * named "Audio" (appended after existing tracks) when needed.
   *
   * Without `range`, returns the first audio track (or creates one).
   *
   * With `range` ([startMs, startMs+durationMs)), returns the first audio track
   * that is free across that span; if every audio track already has a clip
   * overlapping it (or none exist), a fresh audio track is created so the new
   * clip never overlaps an existing one.
   */
  getOrCreateAudioTrack: (range?: {
    startMs: number;
    durationMs: number;
  }) => string;

  /**
   * Remove the `linkId` from every clip in the acted clip's link group,
   * detaching them so they edit independently. No-op if the clip is unlinked.
   */
  unlinkClip: (clipId: string) => void;

  /**
   * Create an imported clip from an Asset and insert it into the store.
   * The clip geometry is derived from the asset's content type and duration.
   * Use this action to add clips created by asset drag-and-drop.
   */
  addImportedClip: (asset: Asset, trackId: string, startMs: number) => string;

  /** Update an arbitrary subset of fields on a clip. */
  patchClip: (clipId: string, patch: Partial<TimelineClip>) => void;

  /** Replace a clip's motion-design animations. One patch per call so undo
   *  granularity stays per-edit. */
  setClipAnimations: (clipId: string, animations: ClipAnimation[]) => void;

  /**
   * Drive a clip's motion from an audio clip. The measuring and the write both
   * happen on the server, which reads the STORED document — so this saves the
   * open document first, posts the bake, and takes back the document the
   * server wrote in one `applyAgentEdit`, i.e. one undo entry. What comes back
   * is merged against the document that was saved, so an edit made while the
   * bake ran survives instead of being overwritten by the server's copy.
   */
  bakeAudioAnimation: (
    body: BakeAudioAnimationBody
  ) => Promise<BakeAudioAnimationResult>;

  /**
   * The look knobs on a clip's generated matte (D2): how hard it cuts, which
   * side it keeps, how soft the edge is. One history entry per call, and a
   * no-op on a clip with no generated matte.
   */
  setGeneratedMatteKnobs: (
    clipId: string,
    knobs: { invert?: boolean; strength?: number; featherPx?: number }
  ) => void;
  /**
   * Make a stored matte version current, the displaced one taking its place in
   * the list. An asset no version carries is a no-op.
   */
  selectGeneratedMatteVersion: (clipId: string, assetId: string) => void;
  /** Drop a clip's generated matte, versions and all. */
  clearGeneratedMatte: (clipId: string) => void;
  /**
   * Cut a matte from the clip's own source on the server.
   *
   * The segmentation reads the STORED document and writes the result onto the
   * clip, so this saves the open document first, marks the clip generating for
   * the editor to show, waits for the run to settle, and takes back the
   * document the server wrote — merged against the document that was saved, so
   * an edit made while the run was in flight survives. Each round of the wait
   * is one undo entry. Resolves null when the run failed — the error
   * reaches the user as a notification rather than an unhandled rejection.
   */
  isolateSubject: (
    clipId: string,
    options?: IsolateSubjectOptions
  ) => Promise<IsolateSubjectResult | null>;

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
  setClipsOutputNode: (
    workflowId: string,
    selectedOutputNodeId: string
  ) => void;

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
    aspectRatio?: string;
    resolution?: string;
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
        | "aspectRatio"
        | "resolution"
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

  /**
   * Append a timeline marker (e.g. a scene boundary) and return it, so a
   * caller that has to report what it placed does not have to go looking.
   */
  addMarker: (input: TimelineMarkerInput) => TimelineMarker;

  /** Remove one marker by id. Unknown ids are a no-op. */
  deleteMarker: (markerId: string) => void;

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

/**
 * The tempo a document with midi tracks and no stored tempo plays at. Stored
 * explicitly rather than left implicit: the PATCH merge keeps the server's
 * tempo when the payload carries none, so an undo that restored `undefined`
 * after the first tempo change would leave the row at the new BPM while the
 * clips went back to their old positions.
 */
function impliedTempo(
  tracks: readonly TimelineTrack[]
): TimelineTempo | undefined {
  return tracks.some((t) => t.type === "midi") ? DEFAULT_TEMPO : undefined;
}

// ── Partialized type for the temporal middleware (only document state is undo-able)

type PartializedState = Pick<
  TimelineStoreState,
  | "tracks"
  | "clips"
  | "markers"
  | "durationMs"
  | "transcript"
  | "scriptEnabled"
  | "tempo"
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
 * temporal `equality`: returns true when two partialized snapshots are
 * equivalent, so no-op sets (guard-returns, `{}` patches, value-identical
 * remaps) don't push duplicate undo entries.
 */
function partializedEqual(
  pastState: PartializedState,
  currentState: PartializedState
): boolean {
  // Fast path: when every array slice is the same reference (the common case
  // for a scalar-only change or a guard-returned no-op), skip the O(n)
  // element-wise comparisons entirely and only check the scalars.
  if (
    pastState.tracks === currentState.tracks &&
    pastState.clips === currentState.clips &&
    pastState.markers === currentState.markers &&
    pastState.transcript === currentState.transcript
  ) {
    return (
      pastState.durationMs === currentState.durationMs &&
      pastState.scriptEnabled === currentState.scriptEnabled &&
      shallowRecordEqual(pastState.tempo, currentState.tempo)
    );
  }
  // `&&` short-circuits, so a diverging earlier slice avoids scanning later
  // ones; `shallowArrayEqual` itself returns immediately on reference equality.
  return (
    pastState.durationMs === currentState.durationMs &&
    shallowArrayEqual(pastState.tracks, currentState.tracks) &&
    shallowArrayEqual(pastState.clips, currentState.clips) &&
    shallowArrayEqual(pastState.markers, currentState.markers) &&
    shallowArrayEqual(pastState.transcript, currentState.transcript) &&
    pastState.scriptEnabled === currentState.scriptEnabled &&
    shallowRecordEqual(pastState.tempo, currentState.tempo)
  );
}

// ── Single-item field-patch helper (pure) ───────────────────────────────────

/**
 * Map `items`, applying `patch` to the element whose `id` matches. Returns the
 * SAME array reference when the target is absent or the patch is shallow-equal
 * to the current field values, so callers can `return state` on a no-op and
 * avoid a needless allocation + subscriber re-render. Unchanged elements keep
 * their object identity (only the matched element is re-created).
 */
/**
 * Insert `track` at `atIndex` (clamped) and renumber `index` on every track so
 * it always matches array position, as `reorderTracks` does.
 */
function insertTrackAt(
  tracks: readonly TimelineTrack[],
  track: TimelineTrack,
  atIndex: number
): TimelineTrack[] {
  const at = Math.max(0, Math.min(atIndex, tracks.length));
  const next = [...tracks.slice(0, at), track, ...tracks.slice(at)];
  return next.map((t, index) => (t.index === index ? t : { ...t, index }));
}

function patchById<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<T>
): T[] {
  const target = items.find((it) => it.id === id);
  if (!target) {
    return items;
  }
  const keys = Object.keys(patch) as Array<keyof T>;
  const unchanged = keys.every((k) => Object.is(target[k], patch[k]));
  if (unchanged) {
    return items;
  }
  return items.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

/**
 * Rewrite one midi clip's note list through `edit`, as one undo entry.
 *
 * The clip's other fields do not move: a note edit changes what is played
 * inside the window, never where the window sits. A clip that is not midi, or
 * an edit that returns the notes unchanged, writes nothing.
 */
function editMidiNotes(
  set: (
    updater: (state: TimelineStoreState) => Partial<TimelineStoreState>
  ) => void,
  clipId: string,
  edit: (notes: readonly MidiNote[]) => MidiNote[]
): void {
  set((state) => {
    const clip = state.clips.find((c) => c.id === clipId);
    if (!clip || clip.mediaType !== "midi") {
      return state;
    }
    const notes = sortNotes(edit(clip.notes ?? []));
    if (sameNotes(clip.notes ?? [], notes)) {
      return state;
    }
    return {
      clips: state.clips.map((c) => (c.id === clipId ? { ...c, notes } : c))
    };
  });
}

/** Whether two note lists carry the same notes, field for field. */
function sameNotes(a: readonly MidiNote[], b: readonly MidiNote[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((note, index) => {
    const other = b[index];
    return (
      note.id === other.id &&
      note.pitch === other.pitch &&
      note.velocity === other.velocity &&
      note.startTick === other.startTick &&
      note.durationTick === other.durationTick
    );
  });
}

/** Ids of the tracks a ripple must leave alone. */
function lockedTrackIds(tracks: readonly TimelineTrack[]): Set<string> {
  return new Set(tracks.filter((t) => t.locked).map((t) => t.id));
}

/**
 * Remove `ids` from `clips`: a deleted group releases its children, and a
 * link group left with one member drops its linkId.
 */
function removeClipsLinkAware(
  clips: readonly TimelineClip[],
  ids: ReadonlySet<string>
): TimelineClip[] {
  const affectedLinkIds = new Set<string>();
  let remaining: TimelineClip[] = [...clips];
  for (const c of clips) {
    if (!ids.has(c.id)) continue;
    if (c.linkId !== undefined) affectedLinkIds.add(c.linkId);
    if (isGroupClip(c)) remaining = ungroup(remaining, c.id);
  }
  const next = remaining.filter((c) => !ids.has(c.id));

  if (affectedLinkIds.size > 0) {
    const linkCounts = new Map<string, number>();
    const lastSeenLinkIndex = new Map<string, number>();
    for (let j = 0; j < next.length; j++) {
      const linkId = next[j].linkId;
      if (linkId !== undefined && affectedLinkIds.has(linkId)) {
        const count = (linkCounts.get(linkId) ?? 0) + 1;
        linkCounts.set(linkId, count);
        if (count === 1) {
          lastSeenLinkIndex.set(linkId, j);
        } else if (count === 2) {
          lastSeenLinkIndex.delete(linkId);
        }
      }
    }
    for (const idx of lastSeenLinkIndex.values()) {
      next[idx] = { ...next[idx], linkId: undefined };
    }
  }
  return next;
}

// ── Scene split/merge helpers (pure) ───────────────────────────────────────

/**
 * Split every clip that strictly contains `timeMs` into two halves,
 * link-aware. Delegates to `splitClipsLinkAware` with every clip as a
 * candidate target so a split through a linked A/V pair mints one fresh
 * linkId for the LEFT halves and another for the RIGHT halves, rather than
 * leaving all four halves sharing the original linkId.
 */
function splitAllClipsAt(
  clips: TimelineClip[],
  timeMs: number
): TimelineClip[] {
  return splitClipsLinkAware(
    clips,
    timeMs,
    clips.map((c) => c.id)
  );
}

/**
 * Split `targetIds` at absolute `atMs`, link-aware. When a split clip carries
 * a `linkId`, every linked sibling that contains `atMs` is split at the same
 * point so the link stays a pair on each side: all LEFT halves get one fresh
 * linkId, all RIGHT halves another (so neither side is a 3-member group). A
 * sibling that does not contain `atMs` (rare — links stay time-aligned) is
 * left untouched and excluded from the new groups. `targetIds` is deduped so a
 * sibling that is also a target is split only once.
 */
function splitClipsLinkAware(
  clips: TimelineClip[],
  atMs: number,
  targetIds: string[]
): TimelineClip[] {
  // A group is a transform parent, not media: `splitClip` refuses it, so it is
  // never a target and its children are split individually.
  const contains = (c: TimelineClip) =>
    !isGroupClip(c) && atMs > c.startMs && atMs < c.startMs + c.durationMs;

  // Expand targets to include linked siblings that also contain atMs, deduped.
  const toSplit = new Map<string, TimelineClip>();
  const targetIdSet = new Set(targetIds);
  const affectedLinkIds = new Set<string>();

  // First pass: find target clips and record their link groups
  for (const clip of clips) {
    if (targetIdSet.has(clip.id) && contains(clip)) {
      toSplit.set(clip.id, clip);
      if (clip.linkId !== undefined) {
        affectedLinkIds.add(clip.linkId);
      }
    }
  }

  // Second pass: add linked siblings that also contain atMs
  if (affectedLinkIds.size > 0) {
    for (const clip of clips) {
      if (
        clip.linkId !== undefined &&
        affectedLinkIds.has(clip.linkId) &&
        contains(clip) &&
        !toSplit.has(clip.id)
      ) {
        toSplit.set(clip.id, clip);
      }
    }
  }
  if (toSplit.size === 0) {
    return clips;
  }

  // One fresh linkId per original group, for each side. Lone (unlinked) clips
  // keep no link on their halves.
  const leftLinkByGroup = new Map<string, string>();
  const rightLinkByGroup = new Map<string, string>();
  const groupLink = (
    map: Map<string, string>,
    sourceLinkId: string
  ): string => {
    let id = map.get(sourceLinkId);
    if (id === undefined) {
      id = createTimeOrderedUuid();
      map.set(sourceLinkId, id);
    }
    return id;
  };

  const next: TimelineClip[] = [];
  for (const clip of clips) {
    if (toSplit.has(clip.id)) {
      try {
        const [left, right] = splitClip(clip, atMs);
        if (clip.linkId !== undefined) {
          left.linkId = groupLink(leftLinkByGroup, clip.linkId);
          right.linkId = groupLink(rightLinkByGroup, clip.linkId);
        } else {
          delete left.linkId;
          delete right.linkId;
        }
        next.push(left, right);
      } catch {
        // atMs outside this clip's bounds — leave it untouched.
        next.push(clip);
      }
    } else {
      next.push(clip);
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

  // Pre-group potential left clips that end near timeMs by track and asset ID
  // for O(1) candidate lookup instead of an O(N) array search on every right clip.
  const candidatesByTrackAsset = new Map<string, TimelineClip[]>();
  for (const c of clips) {
    if (Math.abs(c.startMs + c.durationMs - timeMs) <= EPS) {
      const key = `${c.trackId}::${c.currentAssetId}`;
      let list = candidatesByTrackAsset.get(key);
      if (!list) {
        list = [];
        candidatesByTrackAsset.set(key, list);
      }
      list.push(c);
    }
  }

  if (candidatesByTrackAsset.size === 0) return clips;

  for (const right of clips) {
    if (removed.has(right.id)) continue;
    if (Math.abs(right.startMs - timeMs) > EPS) continue;

    const key = `${right.trackId}::${right.currentAssetId}`;
    const potentialLefts = candidatesByTrackAsset.get(key);

    let left: TimelineClip | undefined;
    if (potentialLefts) {
      for (const c of potentialLefts) {
        if (
          c.id !== right.id &&
          !removed.has(c.id) &&
          // Source contiguity: the left half's source out-point must meet the
          // right half's source in-point. Use outPointMs (set on every split half)
          // rather than inPointMs + durationMs, which only holds at 1× speed.
          Math.abs(
            (c.outPointMs ?? (c.inPointMs ?? 0) + c.durationMs) -
              (right.inPointMs ?? 0)
          ) <= EPS
        ) {
          left = c;
          break;
        }
      }
    }

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

const emptyState = {
  sequenceId: null,
  baseUpdatedAt: null,
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  tracks: [],
  clips: [],
  markers: [],
  transcript: [],
  scriptEnabled: false,
  tempo: undefined,
  setup: null,
  linkedSelection: true,
  syncedDocument: null
} satisfies {
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
  scriptEnabled: boolean;
  tempo: TimelineTempo | undefined;
  setup: TimelineSetup | null;
  linkedSelection: boolean;
  syncedDocument: TimelineStoreState["syncedDocument"];
};

/**
 * Whether `candidate` is a strictly older concurrency token than `current`.
 *
 * `updated_at` tokens are ISO timestamps, so ordering them is a date compare.
 * A pair that does not parse as dates carries no ordering, and reads as "not
 * older" — the caller then proceeds as it did before this check existed.
 */
export function isOlderUpdatedAt(
  candidate: string,
  current: string | null
): boolean {
  if (current == null || candidate === current) return false;
  const candidateMs = Date.parse(candidate);
  const currentMs = Date.parse(current);
  if (Number.isNaN(candidateMs) || Number.isNaN(currentMs)) return false;
  return candidateMs < currentMs;
}

/** The current document as the merge base for the next external change. */
const syncedSnapshotOf = (
  state: Pick<
    TimelineStoreState,
    | "tracks"
    | "clips"
    | "markers"
    | "transcript"
    | "scriptEnabled"
    | "fps"
    | "width"
    | "height"
  >
): NonNullable<TimelineStoreState["syncedDocument"]> => ({
  tracks: state.tracks,
  clips: state.clips,
  markers: state.markers,
  transcript: state.transcript,
  scriptEnabled: state.scriptEnabled,
  fps: state.fps,
  width: state.width,
  height: state.height
});

// ── Server-write adoption ──────────────────────────────────────────────────

/** The document as the editor last read or wrote it. */
type TimelineSyncedDoc = NonNullable<TimelineStoreState["syncedDocument"]>;

/** What `trpc.timeline.get` answers with. */
type FetchedSequence = Awaited<
  ReturnType<typeof trpcClient.timeline.get.query>
>;

/**
 * The write a server route made, as merge ops: it wrote the clips it was
 * pointed at and nothing else. Without ops the merge engine reads the fetched
 * copy as a whole-document replacement, which a dirty draft refuses whole —
 * the generated field would never arrive.
 */
const clipWriteOps = (clipIds: readonly string[]): DocumentOp[] =>
  clipIds.map((clipId) => ({
    tool: "ui_timeline_update_clip",
    input: { clip_id: clipId }
  }));

/**
 * Take back the document a server route wrote, keeping every edit the user
 * made while the request was in flight.
 *
 * `base` is the document as the action saved it — the copy the server started
 * from — so the three-way merge of (base, current draft, fetched copy) hands
 * the generated field to the clips the route wrote and leaves every other
 * local edit, addition and deletion alone. Adopting the fetched copy wholesale
 * (what this replaced) dropped any edit made inside the request window,
 * because `setBaseUpdatedAt` then marked the replacement as synchronized and
 * autosave had nothing left to write.
 *
 * The whole write is one `applyAgentEdit`, i.e. one undo entry. Returns the
 * base for the next adoption, so a polling caller rolls forward instead of
 * merging against a copy two rounds old.
 *
 * The caller has already checked that the store still holds this sequence.
 */
function adoptServerSequence(
  get: () => TimelineStoreState,
  sequence: FetchedSequence,
  base: TimelineSyncedDoc,
  touchedClipIds: readonly string[]
): TimelineSyncedDoc {
  const state = get();
  const draft: TimelineMergeDoc = {
    tracks: state.tracks,
    clips: state.clips,
    markers: state.markers,
    transcript: state.transcript,
    scriptEnabled: state.scriptEnabled,
    fps: state.fps,
    width: state.width,
    height: state.height
  };
  // A field the response leaves out is one the route did not write, so the
  // base stands in for it rather than reading as an external clear.
  const server: TimelineMergeDoc = {
    tracks: sequence.tracks ?? base.tracks,
    clips: sequence.clips ?? base.clips,
    markers: sequence.markers ?? base.markers,
    transcript: sequence.transcript ?? base.transcript,
    scriptEnabled: sequence.scriptEnabled ?? base.scriptEnabled,
    fps: sequence.fps ?? base.fps,
    width: sequence.width ?? base.width,
    height: sequence.height ?? base.height
  };

  const { doc, nextBase } = mergeTimelineDocuments(
    base,
    draft,
    server,
    clipWriteOps(touchedClipIds)
  );

  get().applyAgentEdit({
    tracks: doc.tracks as TimelineTrack[],
    clips: doc.clips as TimelineClip[],
    markers: doc.markers as TimelineMarker[]
  });
  // The base for the next external change is what the SERVER holds, minus the
  // slots the draft refused, which keep the base they had — the rule
  // `MergeResult.nextBase` documents.
  const synced: TimelineSyncedDoc = {
    tracks: nextBase.tracks as TimelineTrack[],
    clips: nextBase.clips as TimelineClip[],
    markers: nextBase.markers as TimelineMarker[],
    transcript: nextBase.transcript as TranscriptLine[],
    scriptEnabled: nextBase.scriptEnabled,
    fps: nextBase.fps,
    width: nextBase.width,
    height: nextBase.height
  };
  get().setBaseUpdatedAt(sequence.updatedAt, synced);
  return synced;
}

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
            const next = {
              sequenceId: seq.id,
              baseUpdatedAt: seq.updatedAt,
              fps: seq.fps,
              width: seq.width,
              height: seq.height,
              durationMs: Math.max(seq.durationMs, durationMs),
              tracks,
              clips,
              markers: seq.markers,
              transcript: [] as TranscriptLine[],
              scriptEnabled: seq.scriptEnabled ?? clips.some(isTranscriptClip),
              tempo: seq.tempo ?? impliedTempo(seq.tracks),
              setup: seq.setup ?? null
            };
            set({
              ...next,
              syncedDocument: syncedSnapshotOf(next)
            });
            return;
          }

          const next = {
            sequenceId: seq.id,
            baseUpdatedAt: seq.updatedAt,
            fps: seq.fps,
            width: seq.width,
            height: seq.height,
            durationMs: seq.durationMs,
            tracks: seq.tracks,
            clips: seq.clips,
            markers: seq.markers,
            transcript: [],
            scriptEnabled: seq.scriptEnabled ?? seq.clips.some(isTranscriptClip),
            tempo: seq.tempo ?? impliedTempo(seq.tracks),
            setup: seq.setup ?? null
          };
          set({
            ...next,
            syncedDocument: syncedSnapshotOf(next)
          });
        },

        reset: () => set({ ...emptyState }),

        applyExternalMerge: (patch) => {
          set((state) => {
            const clips = patch.clips ?? state.clips;
            const next: Partial<TimelineStoreState> = { ...patch, clips };
            if (patch.clips !== undefined || patch.tracks !== undefined) {
              const reflowed = reflowGenerated(clips);
              next.clips = reflowed.clips;
              // Recomputed from the merged clips, not raised to fit them: a
              // merge that drops or shortens clips must shorten the sequence
              // too, or the timeline keeps empty tail the document no longer
              // has. A patch that leaves the clips alone leaves it alone.
              if (patch.clips !== undefined) {
                next.durationMs = reflowed.durationMs;
              }
            }
            return next;
          });
        },

        applyAgentEdit: (next) => {
          set(() => {
            const reflowed = reflowGenerated(next.clips);
            return {
              tracks: next.tracks,
              clips: reflowed.clips,
              markers: next.markers,
              durationMs: reflowed.durationMs
            };
          });
        },

        setBaseUpdatedAt: (updatedAt, synced) =>
          set((state) => {
            if (synced !== undefined) {
              return { baseUpdatedAt: updatedAt, syncedDocument: synced };
            }
            return {
              baseUpdatedAt: updatedAt,
              // A landed save is the server accepting this document: it
              // becomes the merge base for the next external change.
              syncedDocument:
                state.sequenceId != null ? syncedSnapshotOf(state) : null
            };
          }),

        setScriptEnabled: (enabled) => set({ scriptEnabled: enabled }),

        setSetup: (patch) =>
          set((state) => ({
            setup: {
              stage: "idea",
              brief: "",
              ...(state.setup ?? {}),
              ...patch
            }
          })),

        updateBeat: (beatId, patch) =>
          set((state) => {
            const beats = state.setup?.beats;
            if (!beats?.some((beat) => beat.id === beatId)) {
              return {};
            }
            const { transition, ...rest } = patch;
            return {
              setup: {
                ...state.setup,
                stage: state.setup?.stage ?? "review",
                brief: state.setup?.brief ?? "",
                beats: beats.map((beat) =>
                  beat.id === beatId
                    ? {
                        ...beat,
                        ...rest,
                        transition:
                          transition === undefined
                            ? beat.transition
                            : (transition ?? undefined)
                      }
                    : beat
                )
              }
            };
          }),

        removeBeat: (beatId) =>
          set((state) => {
            const beats = state.setup?.beats;
            if (!beats?.some((beat) => beat.id === beatId)) {
              return {};
            }
            return {
              setup: {
                ...state.setup,
                stage: state.setup?.stage ?? "review",
                brief: state.setup?.brief ?? "",
                beats: beats.filter((beat) => beat.id !== beatId)
              }
            };
          }),

        setLinkedSelection: (on) => set({ linkedSelection: on }),

        setProjectSettings: (patch) =>
          set((state) => {
            const next: Partial<TimelineStoreState> = {};
            if (patch.fps != null && patch.fps !== state.fps) {
              next.fps = patch.fps;
            }
            if (patch.width != null && patch.width !== state.width) {
              next.width = patch.width;
            }
            if (patch.height != null && patch.height !== state.height) {
              next.height = patch.height;
            }
            return next;
          }),

        // ── Tracks ──────────────────────────────────────────────────────────

        addTrack: (type, name) => {
          get().insertTrack(type, get().tracks.length, name);
        },

        insertTrack: (type, atIndex, name) => {
          const track = makeTrack({
            type,
            name: name ?? `${type} ${get().tracks.length + 1}`
          });
          // A midi track is nothing without a voice: a clip on an
          // instrument-less track would render silence. `makeTrack` in
          // `@nodetool-ai/timeline` does not fill it in, so the store does.
          if (type === "midi") {
            track.instrument = DEFAULT_MIDI_INSTRUMENT;
          }
          set((state) => {
            const next: Partial<TimelineStoreState> = {
              tracks: insertTrackAt(state.tracks, track, atIndex)
            };
            // The first midi track fixes the tempo the part is written at.
            if (type === "midi" && state.tempo === undefined) {
              next.tempo = DEFAULT_TEMPO;
            }
            return next;
          });
          return track.id;
        },

        duplicateTrack: (trackId) => {
          const state = get();
          const sourceIndex = state.tracks.findIndex((t) => t.id === trackId);
          if (sourceIndex === -1) {
            return null;
          }
          const source = state.tracks[sourceIndex];
          const copy = makeTrack({
            ...structuredClone(source),
            id: createTimeOrderedUuid(),
            name: `${source.name} copy`,
            effects: source.effects?.map((e) => ({
              ...structuredClone(e),
              id: createTimeOrderedUuid()
            }))
          });
          const copiedClips = cloneClipsToTrack(
            state.clips.filter((c) => c.trackId === trackId),
            copy.id
          );
          set((s) => ({
            tracks: insertTrackAt(s.tracks, copy, sourceIndex + 1),
            clips: [...s.clips, ...copiedClips]
          }));
          return copy.id;
        },

        getOrCreateAudioTrack: (range) => {
          const audioTracks = get().tracks.filter((t) => t.type === "audio");

          // With a range, reuse an audio track only when it has room across the
          // whole span; otherwise (all spans occupied, or no audio track yet)
          // fall through and create a fresh one. Without a range, reuse the
          // first audio track if any exists.
          const reusable = range
            ? audioTracks.find((track) => {
                const endMs = range.startMs + range.durationMs;
                return !get().clips.some(
                  (c) =>
                    c.trackId === track.id &&
                    c.startMs < endMs &&
                    c.startMs + c.durationMs > range.startMs
                );
              })
            : audioTracks[0];

          if (reusable) {
            return reusable.id;
          }

          const track = makeTrack({
            type: "audio",
            name: "Audio",
            index: get().tracks.length
          });
          set((state) => ({ tracks: [...state.tracks, track] }));
          return track.id;
        },

        removeTrack: (trackId) =>
          set((state) => ({
            tracks: state.tracks.filter((t) => t.id !== trackId),
            clips: state.clips.filter((c) => c.trackId !== trackId)
          })),

        reorderTracks: (orderedIds) =>
          set((state) => {
            const byId = new Map(state.tracks.map((t) => [t.id, t]));
            const orderedIdSet = new Set(orderedIds);
            const reordered = orderedIds
              .map((id, index) => {
                const t = byId.get(id);
                return t ? { ...t, index } : null;
              })
              .filter((t): t is TimelineTrack => t !== null);
            // Tracks missing from `orderedIds` (e.g. a caller passed a stale
            // subset) are appended in their original relative order rather
            // than dropped, so their clips are never orphaned.
            let nextIndex = reordered.length;
            for (const t of state.tracks) {
              if (!orderedIdSet.has(t.id)) {
                reordered.push({ ...t, index: nextIndex });
                nextIndex += 1;
              }
            }
            return { tracks: reordered };
          }),

        setTrackHeight: (trackId, heightPx) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { heightPx });
            return tracks === state.tracks ? state : { tracks };
          }),

        setTrackVisible: (trackId, visible) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { visible });
            return tracks === state.tracks ? state : { tracks };
          }),

        setTrackLocked: (trackId, locked) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { locked });
            return tracks === state.tracks ? state : { tracks };
          }),

        setTrackMuted: (trackId, muted) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { muted });
            return tracks === state.tracks ? state : { tracks };
          }),

        setTrackSolo: (trackId, solo) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { solo });
            return tracks === state.tracks ? state : { tracks };
          }),

        setTrackName: (trackId, name) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { name });
            return tracks === state.tracks ? state : { tracks };
          }),

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
          set((state) => {
            const track = state.tracks.find((t) => t.id === trackId);
            const effect = track?.effects?.find((e) => e.id === effectId);
            if (!effect) {
              return state;
            }
            const current = new Map<string, unknown>(Object.entries(effect));
            const unchanged = Object.entries(patch).every(([key, value]) =>
              Object.is(current.get(key), value)
            );
            if (unchanged) {
              return state;
            }
            return {
              tracks: state.tracks.map((t) => {
                if (t.id !== trackId) return t;
                const effects = (t.effects ?? []).map((e) =>
                  e.id === effectId ? ({ ...e, ...patch } as TrackEffect) : e
                );
                return { ...t, effects };
              })
            };
          }),

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

        moveClip: (
          clipId,
          deltaMs,
          toTrackId,
          snapCandidates,
          msPerPx,
          disableSnap
        ) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }

            let newStartMs = Math.max(0, clip.startMs + deltaMs);

            if (!disableSnap && snapCandidates && msPerPx !== undefined) {
              newStartMs = snap(
                newStartMs,
                snapCandidates,
                SNAP_THRESHOLD_PX,
                msPerPx
              );
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
            const appliedDelta = newStartMs - clip.startMs;

            // A group carries what it holds (D4): the children follow the same
            // delta and keep their own tracks, so their z-order is untouched.
            if (isGroupClip(clip)) {
              const moved = moveGroup(state.clips, clipId, appliedDelta);
              return {
                clips: toTrackId
                  ? moved.map((c) =>
                      c.id === clipId ? { ...c, trackId: toTrackId } : c
                    )
                  : moved
              };
            }

            const linkedIds =
              state.linkedSelection && clip.linkId !== undefined
                ? new Set(
                    state.clips
                      .filter(
                        (c) => c.linkId === clip.linkId && c.id !== clipId
                      )
                      .map((c) => c.id)
                  )
                : null;

            return {
              clips: state.clips.map((c) => {
                if (c.id === clipId) {
                  return {
                    ...c,
                    startMs: newStartMs,
                    trackId: toTrackId ?? c.trackId
                  };
                }
                // Linked siblings follow the same start delta but keep their
                // own track — audio stays on the audio track.
                if (linkedIds?.has(c.id)) {
                  return {
                    ...c,
                    startMs: Math.max(0, c.startMs + appliedDelta)
                  };
                }
                return c;
              })
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
              (min, c) =>
                selectedIds.has(c.id) ? Math.min(min, c.startMs) : min,
              primary.startMs
            );
            const effectiveDelta = Math.max(snappedDelta, -minStartMs);

            // Linked siblings of any selected clip that are NOT themselves
            // selected must follow by the same delta (keeping their own track),
            // so a multi-select drag or arrow-key nudge can't desync a link.
            const selectedLinkIds = new Set<string>();
            // A selected group's descendants shift with it for the same reason
            // (D4), whether or not they are themselves selected.
            const carried = new Set<string>();
            for (const c of state.clips) {
              if (!selectedIds.has(c.id)) continue;
              if (state.linkedSelection && c.linkId !== undefined) {
                selectedLinkIds.add(c.linkId);
              }
              if (isGroupClip(c)) {
                for (const id of groupDescendantIds(state.clips, c.id)) {
                  carried.add(id);
                }
              }
            }

            return {
              clips: state.clips.map((c) => {
                if (selectedIds.has(c.id)) {
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
                }
                // Unselected linked sibling or group child — shift it too,
                // but keep its track.
                if (
                  carried.has(c.id) ||
                  (c.linkId !== undefined && selectedLinkIds.has(c.linkId))
                ) {
                  return {
                    ...c,
                    startMs: Math.max(0, c.startMs + effectiveDelta)
                  };
                }
                return c;
              })
            };
          }),

        // Trims change only duration/in-out points. Animations need no rewrite:
        // `compileClipAnimations` clamps windows to the clip's current duration
        // and drops windows that fall off the end at sample time.
        trimClipStart: (clipId, deltaMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            // Trimming a group pulls its children inside the new window; an
            // invalid trim throws and leaves the document alone (D4).
            if (isGroupClip(clip)) {
              try {
                return { clips: trimGroup(state.clips, clipId, "start", deltaMs) };
              } catch {
                return state;
              }
            }
            const linkId = state.linkedSelection ? clip.linkId : undefined;
            // All-or-nothing: compute the primary AND every linked sibling
            // first. If any trim is invalid, abort so the link never desyncs.
            const trimmed = new Map<string, TimelineClip>();
            try {
              trimmed.set(clip.id, trimClip(clip, "start", deltaMs));
              if (linkId !== undefined) {
                for (const c of state.clips) {
                  if (c.id !== clipId && c.linkId === linkId) {
                    trimmed.set(c.id, trimClip(c, "start", deltaMs));
                  }
                }
              }
            } catch {
              return state;
            }
            return {
              clips: state.clips.map((c) => trimmed.get(c.id) ?? c)
            };
          }),

        trimClipEnd: (clipId, deltaMs, maxSourceDurationMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            // Clamp grow deltas so that outPointMs cannot exceed source
            // duration. Never clamp a shrink.
            let clampedDelta = deltaMs;
            if (maxSourceDurationMs !== undefined && deltaMs > 0) {
              const currentOutPointMs =
                clip.outPointMs ?? (clip.inPointMs ?? 0) + clip.durationMs;
              const maxGrow = maxSourceDurationMs - currentOutPointMs;
              clampedDelta = Math.min(deltaMs, Math.max(0, maxGrow));
            }
            if (isGroupClip(clip)) {
              try {
                return {
                  clips: trimGroup(state.clips, clipId, "end", clampedDelta)
                };
              } catch {
                return state;
              }
            }
            const linkId = state.linkedSelection ? clip.linkId : undefined;
            // All-or-nothing: compute the primary AND every linked sibling
            // first. If any trim is invalid, abort so the link never desyncs.
            const trimmed = new Map<string, TimelineClip>();
            try {
              trimmed.set(clip.id, trimClip(clip, "end", clampedDelta));
              if (linkId !== undefined) {
                for (const c of state.clips) {
                  if (c.id !== clipId && c.linkId === linkId) {
                    trimmed.set(c.id, trimClip(c, "end", clampedDelta));
                  }
                }
              }
            } catch {
              return state;
            }
            return {
              clips: state.clips.map((c) => trimmed.get(c.id) ?? c)
            };
          }),

        rippleTrimClipStart: (clipId, deltaMs) =>
          set((state) => {
            try {
              return {
                clips: rippleTrim(state.clips, clipId, "start", deltaMs, {
                  lockedTrackIds: lockedTrackIds(state.tracks),
                  followLinks: state.linkedSelection
                })
              };
            } catch {
              return state;
            }
          }),

        rippleTrimClipEnd: (clipId, deltaMs, maxSourceDurationMs) =>
          set((state) => {
            try {
              return {
                clips: rippleTrim(state.clips, clipId, "end", deltaMs, {
                  lockedTrackIds: lockedTrackIds(state.tracks),
                  followLinks: state.linkedSelection,
                  maxSourceDurationMs
                })
              };
            } catch {
              return state;
            }
          }),

        rollClipEdge: (clipId, edge, deltaMs) =>
          set((state) => {
            try {
              return {
                clips: rollEdit(state.clips, clipId, edge, deltaMs, {
                  followLinks: state.linkedSelection
                })
              };
            } catch {
              return state;
            }
          }),

        rippleDeleteSelected: (selectedIds) =>
          set((state) => {
            // Which clips left and the spans they covered come from the
            // pre-delete array; the shift runs over the survivors.
            const removed = state.clips.filter((c) => selectedIds.has(c.id));
            if (removed.length === 0) return state;
            const survivors = removeClipsLinkAware(state.clips, selectedIds);
            return {
              clips: rippleDelete([...removed, ...survivors], selectedIds, {
                lockedTrackIds: lockedTrackIds(state.tracks)
              })
            };
          }),

        closeGapAt: (trackId, timeMs) =>
          set((state) => {
            const next = closeGap(state.clips, trackId, timeMs, {
              lockedTrackIds: lockedTrackIds(state.tracks)
            });
            return next.length === state.clips.length &&
              next.every((c, i) => c === state.clips[i])
              ? state
              : { clips: next };
          }),

        resolveDrop: (movedIds, mode) =>
          set((state) => {
            if (mode === "overlap") return state;
            return {
              clips: resolveDrop(state.clips, movedIds, mode, {
                lockedTrackIds: lockedTrackIds(state.tracks)
              })
            };
          }),

        applyDefaultTransition: (clipIds, durationMs = DEFAULT_TRANSITION_MS) =>
          set((state) => {
            let clips: TimelineClip[] = state.clips;
            for (const id of clipIds) {
              if (!clips.some((c) => c.id === id)) continue;
              clips = applyTransitionAtCut(clips, id, durationMs);
            }
            return clips === state.clips ? state : { clips };
          }),

        setTransitionDuration: (clipId, durationMs) =>
          set((state) => {
            if (!state.clips.some((c) => c.id === clipId)) return state;
            return { clips: applyTransitionAtCut(state.clips, clipId, durationMs) };
          }),

        removeTransition: (clipId) =>
          set((state) => ({ clips: removeTransitionAtCut(state.clips, clipId) })),

        setClipKeyframe: (clipId, property, atMs, value) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return state;
            const animations = setKeyframe(clip, property, atMs, value);
            return {
              clips: state.clips.map((c) =>
                c.id === clipId ? { ...c, animations } : c
              )
            };
          }),

        removeClipKeyframe: (clipId, property, atMs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return state;
            const animations = removeKeyframe(clip, property, atMs);
            return {
              clips: state.clips.map((c) =>
                c.id === clipId ? { ...c, animations } : c
              )
            };
          }),

        addSourceRange: (asset, trackId, startMs, inMs, outMs) => {
          const base = assetToClip(asset, trackId, startMs);
          const ranged: TimelineClip =
            base.mediaType === "image"
              ? { ...base, durationMs: Math.max(1, outMs - inMs) || base.durationMs }
              : {
                  ...base,
                  inPointMs: inMs,
                  outPointMs: outMs,
                  durationMs: Math.max(1, outMs - inMs)
                };
          set((state) => ({ clips: [...state.clips, ranged] }));
          return ranged.id;
        },

        splitClipAtTime: (clipId, atMs) =>
          set((state) => {
            const next = splitClipsLinkAware(state.clips, atMs, [clipId]);
            return next === state.clips ? state : { clips: next };
          }),

        splitSelectedAtPlayhead: (currentTimeMs, selectedIds) =>
          set((state) => {
            // Target every selected clip containing the playhead (or all clips
            // when nothing is selected). splitClipsLinkAware dedupes so a
            // sibling that is also selected is split only once.
            const targetIds = state.clips
              .filter(
                (c) =>
                  (selectedIds.size === 0 || selectedIds.has(c.id)) &&
                  currentTimeMs > c.startMs &&
                  currentTimeMs < c.startMs + c.durationMs
              )
              .map((c) => c.id);
            const next = splitClipsLinkAware(
              state.clips,
              currentTimeMs,
              targetIds
            );
            return next === state.clips ? state : { clips: next };
          }),

        duplicateSelected: (selectedIds, offsetMs = 0) => {
          const newIds: string[] = [];
          set((state) => {
            const sources = state.clips.filter((c) => selectedIds.has(c.id));
            // Count how many members of each link group are being duplicated
            // together — a fully-duplicated group keeps a link (under a fresh
            // id so copies form their OWN group); a lone half loses its link.
            const groupCount = new Map<string, number>();
            for (const c of sources) {
              if (c.linkId !== undefined) {
                groupCount.set(c.linkId, (groupCount.get(c.linkId) ?? 0) + 1);
              }
            }
            const freshLinkByGroup = new Map<string, string>();
            const newClips = sources.map((c) => {
              const id = createTimeOrderedUuid();
              newIds.push(id);
              let linkId: string | undefined;
              if (
                c.linkId !== undefined &&
                (groupCount.get(c.linkId) ?? 0) >= 2
              ) {
                let fresh = freshLinkByGroup.get(c.linkId);
                if (fresh === undefined) {
                  fresh = createTimeOrderedUuid();
                  freshLinkByGroup.set(c.linkId, fresh);
                }
                linkId = fresh;
              }
              return makeClip({
                ...c,
                id,
                startMs: c.startMs + c.durationMs + offsetMs,
                linkId
              });
            });
            return { clips: [...state.clips, ...newClips] };
          });
          return newIds;
        },

        deleteSelected: (selectedIds) =>
          set((state) => ({
            clips: removeClipsLinkAware(state.clips, selectedIds)
          })),

        deleteClip: (clipId) =>
          set((state) => {
            const target = state.clips.find((c) => c.id === clipId);
            const linkId = target?.linkId;
            // Deleting a group deletes the parent, not the picture: its
            // children stay where they are and stop inheriting (D4).
            const remaining =
              target && isGroupClip(target)
                ? ungroup(state.clips, clipId)
                : state.clips;
            const clips = remaining.filter((c) => c.id !== clipId);
            if (linkId !== undefined) {
              let linkedClipCount = 0;
              let lastLinkedClipIndex = -1;
              for (let j = 0; j < clips.length; j++) {
                if (clips[j].linkId === linkId) {
                  linkedClipCount++;
                  lastLinkedClipIndex = j;
                  if (linkedClipCount >= 2) break;
                }
              }
              if (linkedClipCount < 2 && lastLinkedClipIndex !== -1) {
                clips[lastLinkedClipIndex] = {
                  ...clips[lastLinkedClipIndex],
                  linkId: undefined
                };
              }
            }
            return { clips };
          }),

        // ── MIDI ──────────────────────────────────────────────────────────

        setTempo: (tempo) =>
          set((state) => {
            const previous = resolveTempo(state);
            // A repeat of the stored tempo is a no-op. A document that stores
            // none is NOT: setting it to 120 changes nothing about playback but
            // does record the tempo the part was written at, which is what a
            // later change rescales from.
            if (
              state.tempo !== undefined &&
              previous.bpm === tempo.bpm &&
              previous.offsetMs === tempo.offsetMs &&
              previous.timeSignature.beatsPerBar ===
                tempo.timeSignature.beatsPerBar &&
              previous.timeSignature.beatUnit === tempo.timeSignature.beatUnit
            ) {
              return state;
            }
            return {
              tempo,
              clips: rescaleClipsForTempo(
                state.clips,
                state.tracks,
                previous,
                tempo
              )
            };
          }),

        setTrackInstrument: (trackId, instrument) =>
          set((state) => {
            const tracks = patchById(state.tracks, trackId, { instrument });
            return tracks === state.tracks ? state : { tracks };
          }),

        addMidiClip: (opts) => {
          const clip = makeClip({
            id: createTimeOrderedUuid(),
            trackId: opts.trackId,
            name: opts.name ?? "MIDI",
            startMs: Math.max(0, opts.startMs),
            durationMs: Math.max(1, opts.durationMs),
            mediaType: "midi",
            // The notes ARE the clip's content — nothing generates it and
            // there is no asset to wait for — so it is imported+generated,
            // exactly as an authored text clip is, and no generation path
            // picks it up.
            sourceType: "imported",
            status: "generated",
            locked: false,
            versions: [],
            notes: sortNotes((opts.notes ?? []).map(createMidiNote))
          });
          set((state) => ({ clips: [...state.clips, clip] }));
          return clip.id;
        },

        setClipNotes: (clipId, notes) =>
          get().patchClip(clipId, {
            notes: sortNotes(notes.map(createMidiNote))
          }),

        transposeClip: (clipId, semitones) =>
          editMidiNotes(set, clipId, (notes) =>
            transposeNotes(notes, Math.trunc(semitones))
          ),

        quantizeClip: (clipId, options) =>
          editMidiNotes(set, clipId, (notes) => quantizeNotes(notes, options)),

        scaleClipVelocity: (clipId, factor) =>
          editMidiNotes(set, clipId, (notes) => scaleVelocity(notes, factor)),

        addClip: (clip) =>
          set((state) => ({
            clips: [...state.clips, clip]
          })),

        addClips: (clips) =>
          set((state) =>
            clips.length === 0 ? state : { clips: [...state.clips, ...clips] }
          ),

        addImportedClip: (asset, trackId, startMs) => {
          const clip = assetToClip(asset, trackId, startMs);
          set((state) => ({ clips: [...state.clips, clip] }));
          return clip.id;
        },

        unlinkClip: (clipId) =>
          set((state) => {
            const linkId = state.clips.find((c) => c.id === clipId)?.linkId;
            if (!linkId) {
              return state;
            }
            return {
              clips: state.clips.map((c) =>
                c.linkId === linkId ? { ...c, linkId: undefined } : c
              )
            };
          }),

        patchClip: (clipId, patch) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            // Clip gone → nothing to patch. Return the SAME state so no
            // subscriber re-renders and no undo entry is pushed.
            if (!clip) {
              return state;
            }
            // Shallow-equal patch → the result would be value-identical, so
            // skip the array allocation entirely.
            const keys = Object.keys(patch) as Array<keyof TimelineClip>;
            const unchanged = keys.every((k) => Object.is(clip[k], patch[k]));
            if (unchanged) {
              return state;
            }
            return {
              clips: state.clips.map((c) =>
                c.id === clipId ? { ...c, ...patch } : c
              )
            };
          }),

        // patchClip replaces the `animations` array wholesale (spread, no
        // array merge) and flows through the temporal middleware, so this is
        // just a typed, discoverable entry point for animation edits.
        setClipAnimations: (clipId, animations) =>
          get().patchClip(clipId, { animations }),

        bakeAudioAnimation: async (body) => {
          const sequenceId = get().sequenceId;
          if (!sequenceId) {
            throw new Error("No timeline is open.");
          }

          // The bake measures and writes against the STORED document, so the
          // open one is persisted first — unconditionally, because a save that
          // is only "probably" unnecessary is not worth the chance that the
          // reload below hands the user back a document without their last
          // edit. Autosave's own debounce may have the same bytes in flight;
          // it is single-flight against the same token, so the loser reports a
          // conflict rather than writing twice.
          const beforeSave = get();
          const saved = await trpcClient.timeline.update.mutate({
            id: sequenceId,
            baseUpdatedAt: beforeSave.baseUpdatedAt ?? undefined,
            document: buildTimelineDocumentPayload(beforeSave)
          });
          // What the server now holds, and so the base the bake's own write
          // is merged against below — captured from the document that was
          // SENT, not from the store after the save, which may already carry
          // an edit the user made while the save was in flight.
          const base = syncedSnapshotOf(beforeSave);
          const savedAt = (saved as { updatedAt?: unknown } | undefined)
            ?.updatedAt;
          if (
            typeof savedAt === "string" &&
            get().sequenceId === sequenceId
          ) {
            get().setBaseUpdatedAt(savedAt);
          }

          const result = await postAudioAnimationBake(sequenceId, body);
          const sequence = await trpcClient.timeline.get.query({
            id: sequenceId
          });

          // The editor may have moved to another sequence while the bake ran;
          // loading this one over it is the clobber every reload path avoids.
          if (get().sequenceId !== sequenceId) return result;

          adoptServerSequence(get, sequence, base, [
            result.clip_id || body.target_clip_id
          ]);
          return result;
        },

        setGeneratedMatteKnobs: (clipId, knobs) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            const matte = clip?.generatedMatte;
            if (!clip || !matte) return state;
            const next: ClipGeneratedMatte = { ...matte };
            if (knobs.invert !== undefined) next.invert = knobs.invert;
            if (knobs.strength !== undefined) {
              next.strength = Math.min(1, Math.max(0, knobs.strength));
            }
            if (knobs.featherPx !== undefined) {
              next.featherPx = Math.max(0, knobs.featherPx);
            }
            // A knob set to the value it already holds is not an edit, so it
            // gets no undo entry and no re-render.
            if (
              next.invert === matte.invert &&
              next.strength === matte.strength &&
              next.featherPx === matte.featherPx
            ) {
              return state;
            }
            return {
              clips: state.clips.map((c) =>
                c.id === clipId ? { ...c, generatedMatte: next } : c
              )
            };
          }),

        selectGeneratedMatteVersion: (clipId, assetId) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return state;
            const next = selectMatteVersionOnClip(clip, assetId);
            if (next === clip) return state;
            return {
              clips: state.clips.map((c) => (c.id === clipId ? next : c))
            };
          }),

        clearGeneratedMatte: (clipId) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return state;
            const next = clearMatteOnClip(clip);
            if (next === clip) return state;
            return {
              clips: state.clips.map((c) => (c.id === clipId ? next : c))
            };
          }),

        isolateSubject: async (clipId, options = {}) => {
          const sequenceId = get().sequenceId;
          if (!sequenceId) {
            throw new Error("No timeline is open.");
          }
          const clip = get().clips.find((c) => c.id === clipId);
          if (!clip) {
            throw new Error(`Clip ${clipId} not found`);
          }
          const previous = clip.generatedMatte;

          const {
            pollIntervalMs = MATTE_POLL_INTERVAL_MS,
            timeoutMs = MATTE_POLL_TIMEOUT_MS,
            ...body
          } = options;

          /** Write one status onto the clip's matte without touching the rest. */
          const mark = (status: ClipGeneratedMatte["status"]): void => {
            set((state) => ({
              clips: state.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      generatedMatte: {
                        // Nothing has been cut yet on a first run, so the
                        // placeholder carries no asset — the scene model draws
                        // a matte only when it is `ready`, so it never reaches
                        // the picture.
                        assetId: "",
                        sourceAssetId: c.currentAssetId ?? "",
                        sourceRange: { fromMs: 0, toMs: 0 },
                        settings: {},
                        ...(previous ?? {}),
                        status
                      }
                    }
                  : c
              )
            }));
          };

          /**
           * Take back the document the server wrote, in one undo entry,
           * merged against `base` so an edit the user made while the matte ran
           * survives. Answers with the SERVER's copy of the clip — whether the
           * run has settled is a question about the row, not about the draft —
           * and with the base for the next round.
           */
          const adopt = async (
            base: TimelineSyncedDoc
          ): Promise<{
            clip: TimelineClip | undefined;
            base: TimelineSyncedDoc;
          }> => {
            const sequence = await trpcClient.timeline.get.query({
              id: sequenceId
            });
            const clips = (sequence.clips ?? []) as TimelineClip[];
            // The editor may have moved to another sequence while the matte
            // ran; loading this one over it is the clobber every reload path
            // avoids.
            if (get().sequenceId !== sequenceId) {
              return { clip: undefined, base };
            }
            const nextBase = adoptServerSequence(get, sequence, base, [clipId]);
            return { clip: clips.find((c) => c.id === clipId), base: nextBase };
          };

          try {
            // The segmentation reads the STORED document, so the open one is
            // persisted first — unconditionally, for the reason the audio bake
            // gives above.
            const beforeSave = get();
            const saved = await trpcClient.timeline.update.mutate({
              id: sequenceId,
              baseUpdatedAt: beforeSave.baseUpdatedAt ?? undefined,
              document: buildTimelineDocumentPayload(beforeSave)
            });
            const savedAt = (saved as { updatedAt?: unknown } | undefined)
              ?.updatedAt;
            if (typeof savedAt === "string" && get().sequenceId === sequenceId) {
              get().setBaseUpdatedAt(savedAt);
            }

            mark("generating");
            // What the server started from: the document that was SENT, plus
            // the placeholder `mark` just wrote onto the clip. The placeholder
            // is this action's own optimistic state, not a user edit — leaving
            // it out of the base would make the clip read as edited on both
            // sides, and the merge would refuse the matte the run produced.
            const sent = syncedSnapshotOf(beforeSave);
            const marked = get().clips.find((c) => c.id === clipId);
            let base: TimelineSyncedDoc = marked
              ? {
                  ...sent,
                  clips: sent.clips.map((c) => (c.id === clipId ? marked : c))
                }
              : sent;

            const result = await postIsolateSubject(sequenceId, {
              ...body,
              clip_id: clipId
            });

            if (result.status !== "generating") {
              await adopt(base);
              return result;
            }

            // The generation outlives this call's socket and settles in the
            // document, so waiting for it is reading the row until it stops
            // saying "generating".
            const deadline = Date.now() + timeoutMs;
            for (;;) {
              await sleep(pollIntervalMs);
              if (get().sequenceId !== sequenceId) return result;
              const settled = await adopt(base);
              base = settled.base;
              if (
                settled.clip === undefined ||
                (settled.clip.generatedMatte?.status ?? "ready") !==
                  "generating"
              ) {
                return result;
              }
              if (Date.now() >= deadline) return result;
            }
          } catch (error) {
            // A run that never landed costs the clip nothing: the result it had
            // goes back exactly as it was, and only a clip that had no matte at
            // all keeps a `failed` marker — the same rule the server-side
            // capability follows.
            if (get().clips.some((c) => c.id === clipId)) {
              if (previous) {
                set((state) => ({
                  clips: state.clips.map((c) =>
                    c.id === clipId ? { ...c, generatedMatte: previous } : c
                  )
                }));
              } else {
                mark("failed");
              }
            }
            useNotificationStore.getState().addNotification({
              type: "error",
              alert: true,
              content:
                error instanceof Error
                  ? `Isolate subject failed: ${error.message}`
                  : "Isolate subject failed."
            });
            return null;
          }
        },

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
              // A lone duplicate is not linked to the source group.
              linkId: undefined,
              // Copy animations with fresh ids so the two clips edit
              // independently (trim/split re-derive windows per clip).
              animations: currentSrc.animations?.map((a) => ({
                ...a,
                id: createTimeOrderedUuid()
              })),
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
          set((state) => {
            const clips = patchById(state.clips, clipId, { locked });
            return clips === state.clips ? state : { clips };
          }),

        replaceClipOutput: (clipId, assetId) =>
          set((state) => {
            const clips = patchById(state.clips, clipId, {
              currentAssetId: assetId
            });
            return clips === state.clips ? state : { clips };
          }),

        markClipsStaleForWorkflow: (workflowId) =>
          set((state) => {
            // Skip the allocation when nothing actually changes status.
            const hasChange = state.clips.some(
              (c) => c.workflowId === workflowId && c.status !== "stale"
            );
            if (!hasChange) {
              return state;
            }
            return {
              clips: state.clips.map((c) =>
                c.workflowId === workflowId && c.status !== "stale"
                  ? { ...c, status: "stale" }
                  : c
              )
            };
          }),

        setParamOverride: (clipId, inputNodeName, value) =>
          set((state) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) {
              return state;
            }
            // Mark as stale only when the clip has already been generated.
            const status: TimelineClip["status"] = clip.lastGeneratedHash
              ? "stale"
              : clip.status;
            const unchanged =
              Object.is(clip.paramOverrides?.[inputNodeName], value) &&
              clip.status === status;
            if (unchanged) {
              return state;
            }
            return {
              clips: state.clips.map((c) => {
                if (c.id !== clipId) return c;
                const paramOverrides = {
                  ...(c.paramOverrides ?? {}),
                  [inputNodeName]: value
                };
                return { ...c, paramOverrides, status };
              })
            };
          }),

        applyInputDrift: (workflowId, added, removed) =>
          set((state) => {
            let changed = false;
            const clips = state.clips.map((c) => {
              if (c.workflowId !== workflowId) return c;
              const current = c.paramOverrides ?? {};
              const hasAddition = added.some(({ name }) => !(name in current));
              const hasRemoval = removed.some((name) => name in current);
              if (!hasAddition && !hasRemoval) {
                return c;
              }
              changed = true;
              const overrides = { ...current };
              for (const { name, defaultValue } of added) {
                if (!(name in overrides)) {
                  overrides[name] = defaultValue;
                }
              }
              for (const name of removed) {
                delete overrides[name];
              }
              return { ...c, paramOverrides: overrides };
            });
            return changed ? { clips } : state;
          }),

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

          // The wire schema and the store's TimelineClip type the loose
          // forward-compat strings the same way, and the compiler tolerates a
          // value it cannot read at sample time, so the cast is safe here.
          set((state) => ({
            clips: [...state.clips, newClip as TimelineClip]
          }));

          return newClip.id;
        },

        addDirectGenClip: (opts) => {
          const bindingKind: ClipBindingKind =
            opts.bindingKind ?? "text-to-image";
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
            aspectRatio: opts.aspectRatio,
            resolution: opts.resolution,
            strength: opts.strength,
            numInferenceSteps: opts.numInferenceSteps,
            status: "draft",
            locked: false,
            versions: []
          });

          set((state) => ({ clips: [...state.clips, clip] }));
          const addedKind = modelKindForBinding(bindingKind);
          if (addedKind && opts.provider && opts.model) {
            useLastModelStore.getState().remember(addedKind, {
              provider: opts.provider,
              model: opts.model,
              voice: opts.voice
            });
          }
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

        setClipDirectGenModel: (clipId, provider, model) => {
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.id !== clipId) return c;
              const status: TimelineClip["status"] =
                c.lastGeneratedHash || c.currentAssetId ? "stale" : c.status;
              return { ...c, provider, model, status };
            })
          }));
          const clip = get().clips.find((c) => c.id === clipId);
          const kind = modelKindForBinding(clip?.bindingKind);
          if (kind) {
            useLastModelStore
              .getState()
              .remember(kind, { provider, model, voice: clip?.voice });
          }
        },

        patchClipBinding: (clipId, patch) => {
          set((state) => ({
            clips: state.clips.map((c) => {
              if (c.id !== clipId) return c;
              const status: TimelineClip["status"] =
                c.lastGeneratedHash || c.currentAssetId ? "stale" : c.status;
              return { ...c, ...patch, status };
            })
          }));
          if (patch.provider && patch.model) {
            const clip = get().clips.find((c) => c.id === clipId);
            const kind = modelKindForBinding(clip?.bindingKind);
            if (kind) {
              useLastModelStore.getState().remember(kind, {
                provider: patch.provider,
                model: patch.model,
                voice: patch.voice ?? clip?.voice
              });
            }
          }
        },

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
          set((state) => {
            const transcript = patch.transcript ?? state.transcript;
            const clips = patch.clips ?? state.clips;
            const durationMs = patch.durationMs ?? state.durationMs;
            // Transcript ripple/reflow ops return the SAME array reference when
            // nothing changed; skip the state update entirely so a no-op edit
            // doesn't re-render subscribers or push an undo entry.
            if (
              transcript === state.transcript &&
              clips === state.clips &&
              durationMs === state.durationMs
            ) {
              return state;
            }
            return { transcript, clips, durationMs };
          }),

        addMarker: (input) => {
          const marker = makeMarker({
            timeMs: Math.max(0, Math.round(input.timeMs)),
            label: input.label ?? ""
          });
          if (input.color !== undefined) marker.color = input.color;
          if (input.note !== undefined) marker.note = input.note;
          set((state) => ({ markers: [...state.markers, marker] }));
          return marker;
        },

        deleteMarker: (markerId) =>
          set((state) => {
            const markers = state.markers.filter((m) => m.id !== markerId);
            return markers.length === state.markers.length ? {} : { markers };
          }),

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
          transcript: state.transcript,
          scriptEnabled: state.scriptEnabled,
          tempo: state.tempo
        })
      }
    )
  );

// ── Store handle type ───────────────────────────────────────────────────────

/** A single timeline-document store instance (with its `temporal` sub-store). */
export type TimelineStoreApi = ReturnType<typeof createTimelineStore>;

/** Read the temporal (undo/redo) state of a given store instance. */
export const timelineTemporalOf = (
  store: TimelineStoreApi
): TemporalState<PartializedState> => store.temporal.getState();

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

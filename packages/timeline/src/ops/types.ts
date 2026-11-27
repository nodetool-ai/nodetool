/**
 * The document an op reads and writes, and everything an op needs that a pure
 * function cannot know.
 *
 * The server bridge and browser store share the op semantics. Hosts supply
 * document state and I/O through this boundary (I11).
 */

import type {
  TimelineSequence,
  TimelineSetup,
  MediaTrack,
  MidiInstrument,
  StepPattern,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  TimelineTempo
} from "../types.js";
import type { TimelineComposition } from "../composition.js";
import type { Model3DBakeSequence } from "../model3dBake.js";
import type { Model3DReferencePass } from "../model3dReference.js";
import type {
  AnimationRole,
  ClipAnimation,
  CustomClipAnimation
} from "../animation/types.js";

/** The document shape every host already holds, plus its editor cursor. */
export interface TimelineOpState {
  workingColorSpaceVersion?: number;
  tempo?: TimelineTempo;
  /** The music-project marker. `get_state` reports it and the CE7 crossfade length. */
  music?: TimelineSequence["music"];
  /** The master bus: fader and insert chain. */
  master?: TimelineSequence["master"];
  trackFolders?: TimelineSequence["trackFolders"];
  setup?: TimelineSetup | null;
  transcript?: TimelineSequence["transcript"];
  scriptEnabled?: boolean;
  templateId?: string | null;
  camera2d?: TimelineSequence["camera2d"];
  fps: number;
  width: number;
  height: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  storyboardMaterializations?: Array<{ boardId: string; elementKeys: string[]; stage?: "layout" | "finished" }>;
  /**
   * Subject/object tracks (P0 AI Video, Phase 2). Optional so a host built
   * before they existed — every literal `TimelineOpState` in this package's
   * own tests, notably — need not carry an empty array; every op here treats
   * an absent array the same as `[]`.
   */
  mediaTracks?: MediaTrack[];
  /** Playhead in ms. `split_clip` with no `atMs` cuts here. */
  playheadMs: number;
  /** Ids `target: "selected"` resolves against. */
  selectedClipIds: string[];
}

/** What the ops know about an asset to place it as a clip. */
export interface TimelineOpAsset {
  id: string;
  name: string;
  contentType: string;
  durationMs?: number;
  thumbnailAssetId?: string;
}

/** One custom-animation bake: a JS body plus the clip context it runs against. */
export interface TimelineOpBakeRequest {
  code: string;
  role: AnimationRole;
  durationMs: number;
  clipDurationMs: number;
  canvas: { width: number; height: number };
  params?: Record<string, number | string | boolean>;
  staggerCount?: number;
}

/** What a bake returns. Mirrors `BakeCustomAnimationResult` minus the logs. */
export interface TimelineOpBakeResult {
  ok: boolean;
  curves?: CustomClipAnimation["curves"];
  mask?: { direction: string; softness: number };
  error?: string;
}

/** What {@link TimelineOpContext.bakeModel3DClip} is asked to render. */
export interface TimelineOpBakeModel3DRequest {
  /** The clip to bake, as it stands after the op's own checks. */
  clip: TimelineClip;
  /** The settings the bake is rendered at. */
  sequence: Model3DBakeSequence;
  /**
   * The hash the result is stored under — the picture the bake is of. Passed
   * in rather than recomputed so the host stores exactly what the op checked.
   */
  dependencyHash: string;
}

/** What a finished bake hands back: the video asset, and the job that made it. */
export interface TimelineOpBakeModel3DResult {
  assetId: string;
  /** Recorded on the clip version, so a bake is traceable to its run. */
  jobId?: string;
}

/** What {@link TimelineOpContext.renderModel3DReference} is asked to render. */
export interface TimelineOpRenderModel3DReferenceRequest {
  /** The clip to render, as it stands after the op's own checks. */
  clip: TimelineClip;
  /** The sequence settings the frames are sampled at. */
  sequence: Model3DBakeSequence;
  pass: Model3DReferencePass;
  /** The hash the result is stored under, computed by the op. */
  dependencyHash: string;
}

/** What a finished reference render hands back. */
export interface TimelineOpRenderModel3DReferenceResult {
  /** The full id of the stored video asset. */
  assetId: string;
  jobId?: string;
}

/** Reads a composition by id and lists what this host offers. */
export interface TimelineOpCompositionLoader {
  get(id: string): Promise<TimelineComposition | null>;
  listIds(): Promise<string[]>;
}

/** Ids a host mints. Kept out of the ops so ids stay the host's to allocate. */
export type TimelineOpIdKind =
  | "track"
  | "clip"
  | "anim"
  | "marker"
  | "version"
  | "note"
  | "beat"
  | "link"
  | "lane"
  | "point"
  | "folder"
  | "effect";

/** One user-saved step sequencer pattern or template entry (SQ44, D92). */
export interface TimelineOpUserStepPattern {
  id: string;
  name: string;
  kind: "pattern" | "template";
  category?: string;
  tags?: readonly string[];
  folder?: string;
  pattern: StepPattern;
  /** Saved track instrument captured with the pattern (SQ43, SQ44). */
  instrument?: MidiInstrument;
  /** Saved instrument preset id, when matching a shipped preset or set explicitly. */
  instrumentPreset?: string;
}

/** One user folder inside `Step Patterns/<Patterns|Templates>` (SQ43, SQ44). */
export interface TimelineOpStepPatternFolder {
  /** Asset id when explicitly persisted as a folder asset; absent when inferred only from patterns. */
  id?: string;
  name: string;
  kind: "pattern" | "template";
  /** Full folder path, e.g. `Step Patterns/Patterns/Drums`. */
  folder: string;
  /** Parent folder path, e.g. `Step Patterns/Patterns`. */
  parentFolder: string;
}

/** Summary of a user pattern moved by a folder rename or delete. */
export interface TimelineOpStepPatternMoveSummary {
  id: string;
  name: string;
  folder: string;
}

export interface TimelineOpCreateStepPatternFolderResult {
  id?: string;
  name: string;
  kind: "pattern" | "template";
  folder: string;
  parentFolder: string;
}

export interface TimelineOpRenameStepPatternFolderResult {
  id?: string;
  name: string;
  kind: "pattern" | "template";
  previousFolder: string;
  folder: string;
  parentFolder: string;
  movedPatternCount: number;
  movedPatterns: TimelineOpStepPatternMoveSummary[];
}

export interface TimelineOpDeleteStepPatternFolderResult {
  kind: "pattern" | "template";
  deletedFolder: string;
  parentFolder: string;
  movedPatternCount: number;
  movedPatterns: TimelineOpStepPatternMoveSummary[];
}

export interface TimelineOpMoveStepPatternResult {
  id: string;
  name: string;
  kind: "pattern" | "template";
  previousFolder: string;
  folder: string;
}

/** Host adapter for listing, saving, and organizing user step sequencer patterns/templates (SQ43, SQ44, D92). */
export interface TimelineOpStepPatternLibrary {
  list(): Promise<TimelineOpUserStepPattern[]>;
  save(entry: {
    name: string;
    kind: "pattern" | "template";
    folder?: string;
    pattern: StepPattern;
    instrument?: MidiInstrument;
    instrumentPreset?: string;
  }): Promise<{ id: string; folder: string; assetId?: string }>;
  listFolders?(): Promise<TimelineOpStepPatternFolder[]>;
  createFolder?(args: {
    kind?: "pattern" | "template";
    name: string;
    parentFolder?: string;
  }): Promise<TimelineOpCreateStepPatternFolderResult>;
  renameFolder?(args: {
    folder: string;
    newName: string;
    kind?: "pattern" | "template";
  }): Promise<TimelineOpRenameStepPatternFolderResult>;
  deleteFolder?(args: {
    folder: string;
    kind?: "pattern" | "template";
  }): Promise<TimelineOpDeleteStepPatternFolderResult>;
  movePattern?(args: {
    pattern: string;
    folder?: string | null;
  }): Promise<TimelineOpMoveStepPatternResult>;
}

/** Complete step pattern library with required folder management functions. */
export type FullStepPatternLibrary = Required<TimelineOpStepPatternLibrary>;

/** Status reported by a VST3/AU plugin host. */
export interface PluginHostStatus {
  available: boolean;
  path?: string;
  reason?: string;
}

/** One scanned VST3/AU plug-in descriptor returned by the host. */
export interface PluginHostPluginInfo {
  uid: string;
  name: string;
  vendor: string;
  version: string;
  path: string;
  format?: "vst3" | "au";
  isInstrument: boolean;
}

/** Target plug-in bundle + type identifier. */
export interface PluginHostTarget {
  path: string;
  uid: string;
}

/** One preset (program) exposed by a loaded VST3/AU plug-in. */
export interface PluginHostPresetInfo {
  index: number;
  name: string;
}

/** Result of listing presets on a loaded VST3/AU plug-in. */
export interface PluginHostListPresetsResult {
  currentPresetIndex: number;
  presets: PluginHostPresetInfo[];
}

/** Result of selecting a preset on a loaded VST3/AU plug-in. */
export interface PluginHostSelectPresetResult {
  preset: PluginHostPresetInfo;
  state: string | null;
}

/** One parameter exposed by a loaded VST3/AU plug-in. */
export interface PluginHostParameterInfo {
  id: string;
  index: number;
  name: string;
  label?: string;
  /** Normalized value in 0..1. */
  value: number;
  /** Formatted display value (e.g. "1200 Hz", "-6.0 dB"). */
  displayValue: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  numSteps?: number;
  isDiscrete?: boolean;
  isBoolean?: boolean;
  isAutomatable?: boolean;
}

/** One requested parameter write (by id/index, normalized or displayValue). */
export interface PluginHostParameterChange {
  id?: string;
  index?: number;
  value?: number;
  displayValue?: string;
}

/** Result of reading parameters from a loaded VST3/AU plug-in. */
export interface PluginHostGetParametersResult {
  parameters: PluginHostParameterInfo[];
}

/** Result of writing parameters on a loaded VST3/AU plug-in. */
export interface PluginHostSetParametersResult {
  parameters: PluginHostParameterInfo[];
  state: string | null;
}

/**
 * Host adapter for scanning third-party VST3/AU plug-ins and reading or
 * updating their presets and parameters (VST1). Absent on surfaces with no
 * plug-in host (plain browser without desktop helper).
 */
export interface TimelineOpPluginHost {
  status?(): Promise<PluginHostStatus> | PluginHostStatus;
  scan(options?: { rescan?: boolean; includeEffects?: boolean }): Promise<PluginHostPluginInfo[]>;
  listPresets(request: {
    instance: string;
    plugin: PluginHostTarget;
    state: string | null;
  }): Promise<PluginHostListPresetsResult>;
  selectPreset(request: {
    instance: string;
    plugin: PluginHostTarget;
    state: string | null;
    presetIndex?: number;
    presetName?: string;
  }): Promise<PluginHostSelectPresetResult>;
  getParameters(request: {
    instance: string;
    plugin: PluginHostTarget;
    state: string | null;
  }): Promise<PluginHostGetParametersResult>;
  setParameters(request: {
    instance: string;
    plugin: PluginHostTarget;
    state: string | null;
    changes: PluginHostParameterChange[];
  }): Promise<PluginHostSetParametersResult>;
}

/** Everything an op needs that the document cannot answer. */
export interface TimelineOpContext {
  newId(kind: TimelineOpIdKind): string;
  followLinks?: boolean;
  allowUnknownMediaDuration?: boolean;
  sequence?: Pick<TimelineSequence, "id" | "projectId" | "name">;
  retargetFormat?(
    sequence: TimelineSequence
  ): Promise<{ sequenceId: string; name?: string }>;
  generateFromBeats?(
    state: TimelineOpState,
    op: Extract<import("./op.js").TimelineOp, { op: "generate_from_beats" }>
  ): Promise<TimelineOpOutcome>;
  /** New MIDI track voice. Hosts may keep their existing preset defaults. */
  defaultMidiInstrument?: TimelineTrack["instrument"];
  /** Timestamp for a baked animation. Defaults to `new Date().toISOString()`. */
  now?(): string;
  /**
   * Decoded source audio of an audio clip, mono. `detect_chords` reads it.
   * `range` is the source span (ms) the op needs. A host decodes only that span
   * where its decoder allows, and reports where `samples[0]` sits in the source
   * as `startMs` (default 0: the buffer starts at source time 0). A host that
   * cannot decode a span returns the whole source from 0. Absent means this
   * surface cannot decode audio, and the op says so. Null means the clip has no
   * readable audio.
   */
  decodeClipAudio?(
    clip: TimelineClip,
    range?: { startMs: number; endMs: number }
  ): Promise<{ samples: Float32Array; sampleRate: number; startMs?: number } | null>;
  /** Asset lookup for `add_media_clip`. Absent means this surface has none. */
  resolveAsset?(ref: string): Promise<TimelineOpAsset | null>;
  /** Bake for `preset: "custom"` with `code`. Absent means curves only. */
  bakeAnimation?(request: TimelineOpBakeRequest): Promise<TimelineOpBakeResult>;
  /** Composition library for `insert_composition`. */
  loadComposition?: TimelineOpCompositionLoader;
  /**
   * Render `bake_model3d_clip` through Blender. Absent means this surface
   * cannot bake — the op reports that instead of pretending it started one,
   * the way `bakeAnimation` reports a host with no JS engine.
   */
  bakeModel3DClip?(
    request: TimelineOpBakeModel3DRequest
  ): Promise<TimelineOpBakeModel3DResult>;
  /**
   * Render `render_model3d_reference` and store the video. Absent means this
   * surface has no renderer, and the op reports that.
   */
  renderModel3DReference?(
    request: TimelineOpRenderModel3DReferenceRequest
  ): Promise<TimelineOpRenderModel3DReferenceResult>;
  /**
   * The host's SVG path parser (`parseSvgPath` from `./scene`). Passed in
   * rather than imported: the parser lives under `src/render`, which this
   * module stays clear of to avoid loading the renderer in edit hosts (AS2).
   */
  parseSvgPath?(d: string): { ok: boolean; error?: string };
  /** User step sequencer pattern/template library adapter (SQ44, SQ54, D92). */
  stepPatternLibrary?: TimelineOpStepPatternLibrary;
  /** Third-party VST3/AU plugin host adapter (VST1). */
  pluginHost?: TimelineOpPluginHost;
}

/** What one op did. `error` set means `state` is the state that went in. */
/**
 * What an op hands back to its caller. Every op returns a JSON object (the
 * bridge serializes it for the tool result), so the shape is a record whose
 * keys the op decides.
 */
export type TimelineOpResult = Record<string, unknown>;

export interface TimelineOpOutcome {
  state: TimelineOpState;
  result: TimelineOpResult;
  changedClipIds: string[];
  error?: string;
}

/** The animation input `animate_clip` takes, before it is built. */
export interface TimelineAnimationInput {
  enabled?: boolean;
  role: ClipAnimation["role"];
  preset: string;
  durationMs?: number;
  delayMs?: number;
  easing?: ClipAnimation["easing"];
  params?: ClipAnimation["params"];
  curves?: unknown;
  code?: string;
  mask?: unknown;
  custom?: { curves?: unknown; code?: string; mask?: unknown };
  stagger?: ClipAnimation["stagger"];
  caret?: ClipAnimation["caret"];
}

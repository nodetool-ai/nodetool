/**
 * timelineAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_timeline_*` frontend tools)
 * and the live timeline editor, mirroring `model3DToolBridge` for the 3D editor.
 *
 * The open {@link TimelineEditor} registers a {@link TimelineAgentHandler} on
 * mount (and clears it on unmount). The handler closes over the editor's
 * per-instance stores (document, UI, playback) plus the direct-generation job
 * runner, so the tools always operate on the focused sequence — or fail cleanly
 * when no timeline editor is open.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * {@link TimelineSnapshot} / {@link TimelineClipNode} objects and never touches
 * Zustand store handles directly.
 */

/** Serializable view of a single timeline track. */
export interface TimelineTrackNode {
  id: string;
  name: string;
  type: "video" | "audio" | "overlay" | "subtitle";
  index: number;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  /** Number of clips currently on this track. */
  clipCount: number;
}

/** Serializable view of a single timeline clip (editor-friendly units). */
export interface TimelineClipNode {
  id: string;
  name: string;
  trackId: string;
  /** Name of the clip's track, or null when the track is gone. */
  trackName: string | null;
  mediaType: "image" | "video" | "audio" | "overlay";
  sourceType: "imported" | "generated";
  bindingKind?: string;
  /** Absolute start on the sequence timeline (ms). */
  startMs: number;
  durationMs: number;
  /** Absolute end on the sequence timeline (ms) — startMs + durationMs. */
  endMs: number;
  inPointMs?: number;
  outPointMs?: number;
  status: string;
  /** Whether the clip has a rendered asset (generated clips). */
  hasRender: boolean;
  prompt?: string;
  provider?: string;
  model?: string;
  voice?: string;
  workflowId?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  speedMultiplier?: number;
  opacity?: number;
  volumeDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  hidden: boolean;
  muted: boolean;
  locked: boolean;
  /** Motion-design animations attached to the clip, when any. */
  animations?: TimelineAnimationNode[];
}

/** Serializable view of one motion-design animation on a clip. */
export interface TimelineAnimationNode {
  id: string;
  role: "in" | "out" | "emphasis" | "loop";
  preset: string;
  durationMs: number;
  delayMs?: number;
  easing?: string;
  enabled?: boolean;
  params?: Record<string, number | string | boolean>;
}

/** Full snapshot of the open sequence the agent reads to plan edits. */
export interface TimelineSnapshot {
  sequenceId: string | null;
  fps: number;
  /** Sequence resolution. */
  width: number;
  height: number;
  durationMs: number;
  /** Current playhead position (ms). */
  playheadMs: number;
  /** Ids of the currently-selected clips. */
  selectedClipIds: string[];
  tracks: TimelineTrackNode[];
  clips: TimelineClipNode[];
}

/** Direct-generation kinds the agent can spawn. */
export type TimelineGenerateKind =
  | "text-to-video"
  | "text-to-image"
  | "text-to-audio";

export interface TimelineGenerateOptions {
  kind: TimelineGenerateKind;
  prompt: string;
  /** Target track id; defaults to a sensible track for the media kind. */
  trackId?: string;
  /** Absolute start (ms); defaults to the end of the target track's content. */
  startMs?: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  /** TTS voice for text-to-audio. */
  voice?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  /** Kick off generation immediately (default true). */
  autoGenerate?: boolean;
}

export interface TimelineGenerateResult {
  clip: TimelineClipNode;
  /** True when a generation job was dispatched for the new clip. */
  generationStarted: boolean;
  /** Why generation did not start, when applicable. */
  note?: string;
}

/** Render/audio params the agent can patch on any clip. */
export interface TimelineClipParamsPatch {
  name?: string;
  opacity?: number;
  speedMultiplier?: number;
  volumeDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  blendMode?: string;
  borderRadius?: number;
  hidden?: boolean;
  muted?: boolean;
  locked?: boolean;
}

/** Generation-binding fields the agent can change on a generated clip. */
export interface TimelineClipBindingPatch {
  prompt?: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
  voice?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  strength?: number;
  numInferenceSteps?: number;
  /** Re-run generation after applying the patch (default false). */
  regenerate?: boolean;
}

export interface TimelineTrimPatch {
  /** New clip duration on the timeline (ms). */
  durationMs?: number;
  /** Source-time trim start (ms). */
  inPointMs?: number;
  /** Source-time trim end (ms). */
  outPointMs?: number;
}

export interface TimelineMovePatch {
  /** New absolute start on the timeline (ms). */
  startMs?: number;
  /** Reassign the clip to a different track. */
  trackId?: string;
}

export interface TimelineClipFramesOptions {
  /** Absolute timeline timestamps to sample. Defaults to evenly spaced samples. */
  timesMs?: number[];
  /** Number of evenly spaced samples when `timesMs` is omitted. */
  count?: number;
  /** Output JPEG width in pixels. */
  width?: number;
}

export interface TimelineClipFrameNode {
  clipId: string;
  clipName: string;
  /** Requested absolute timeline timestamp in milliseconds. */
  timelineTimeMs: number;
  /** Source-media timestamp in milliseconds after trim/speed mapping. */
  sourceTimeMs: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface TimelineClipFramesResult {
  clip: TimelineClipNode;
  frames: TimelineClipFrameNode[];
}

/** One animation the agent asks to apply. Ids and defaults are filled in by
 *  the handler from the preset catalog. */
export interface ClipAnimationInput {
  role: "in" | "out" | "emphasis" | "loop";
  preset: string;
  durationMs?: number;
  delayMs?: number;
  easing?: string;
  enabled?: boolean;
  params?: Record<string, number | string | boolean>;
}

/** How {@link TimelineAgentHandler.setClipAnimations} applies its inputs. */
export type ClipAnimationMode = "add" | "replace";

/**
 * Operations the live {@link TimelineEditor} exposes to the agent tooling
 * layer. Clips and tracks are addressed by id or by (case-insensitive) name;
 * the literal `"selected"` resolves to the single selected clip. Each mutator
 * returns the affected node(s) so the agent gets immediate feedback.
 */
export interface TimelineAgentHandler {
  getSnapshot: () => TimelineSnapshot;
  addTrack: (
    type: TimelineTrackNode["type"],
    name?: string
  ) => TimelineTrackNode;
  generateClip: (
    opts: TimelineGenerateOptions
  ) => Promise<TimelineGenerateResult>;
  /** Split a clip at the given time (defaults to the playhead). */
  splitClip: (target: string, atMs?: number) => TimelineClipNode[];
  trimClip: (target: string, patch: TimelineTrimPatch) => TimelineClipNode;
  moveClip: (target: string, patch: TimelineMovePatch) => TimelineClipNode;
  deleteClip: (target: string) => TimelineClipNode;
  duplicateClip: (target: string, gapMs?: number) => Promise<TimelineClipNode>;
  setClipParams: (
    target: string,
    patch: TimelineClipParamsPatch
  ) => TimelineClipNode;
  setClipBinding: (
    target: string,
    patch: TimelineClipBindingPatch
  ) => Promise<TimelineClipNode>;
  /**
   * Apply motion-design animations to a clip. `replace` (default) swaps the
   * clip's animations; `add` appends. Throws with the valid options when a
   * preset is unknown or a role is not allowed for the preset.
   */
  setClipAnimations: (
    target: string,
    animations: ClipAnimationInput[],
    mode: ClipAnimationMode
  ) => TimelineClipNode;
  /** Remove a clip's animations, optionally only those of one role. */
  clearClipAnimations: (
    target: string,
    role?: ClipAnimationInput["role"]
  ) => TimelineClipNode;
  getClipFrames: (
    target: string,
    opts: TimelineClipFramesOptions
  ) => Promise<TimelineClipFramesResult>;
  selectClip: (target: string | null) => TimelineClipNode | null;
  /** Move the playhead and return the resulting position (ms). */
  seek: (timeMs: number) => number;
}

let handler: TimelineAgentHandler | null = null;

/**
 * Register (or clear, with null) the handler for the currently-focused editor.
 * The editor calls this when it becomes active and clears it on unmount / blur
 * so the ui_timeline_* tools always operate on the live sequence — or fail
 * cleanly when no editor is open.
 */
export function setTimelineAgentHandler(
  next: TimelineAgentHandler | null
): void {
  handler = next;
}

export function hasTimelineAgentHandler(): boolean {
  return handler !== null;
}

export function getTimelineAgentHandler(): TimelineAgentHandler {
  if (!handler) {
    throw new Error(
      "No timeline editor is open. Open a sequence in the timeline editor to use timeline tools."
    );
  }
  return handler;
}

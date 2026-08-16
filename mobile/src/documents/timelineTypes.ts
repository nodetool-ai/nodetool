/**
 * The agent-facing timeline contract on mobile.
 *
 * The human-facing screen is a viewer — a timeline is too dense to cut with a
 * thumb, so `kinds.ts` marks the surface `viewer` — but the document is fully
 * agent-editable (`agentEditable: true`): "move the title card two seconds
 * later" is a sentence, and that is what a phone is good at. The read tools
 * answer questions about a sequence; the write tools apply the edit and the user
 * presses Save.
 *
 * Document types come straight from `@nodetool-ai/timeline` rather than being
 * re-declared here. That package is the same engine the desktop editor uses, so
 * `splitClip`/`trimClip` apply to these values directly and the two surfaces
 * cannot drift.
 *
 * Everything crossing the bridge is a plain serializable value, so the tool
 * layer never touches a Zustand handle.
 */

import type {
  ClipShapeStyle,
  ClipTextStyle,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  TranscriptLine,
} from '@nodetool-ai/timeline';

export type TimelineTrackType = TimelineTrack['type'];
export type TimelineMediaType = TimelineClip['mediaType'];
export type TimelineClipStatus = TimelineClip['status'];

/** Document-shaped aliases, kept so existing call sites read unchanged. */
export type TimelineTrackData = TimelineTrack;
export type TimelineClipData = TimelineClip;
export type TimelineMarkerData = TimelineMarker;

/**
 * The timeline document body — the wire shape of `timelineDocument` in
 * `@nodetool-ai/protocol/api-schemas/timeline`, expressed with the engine's
 * types (the protocol module is zod, is not re-exported from the package root,
 * and mobile has no zod).
 *
 * `fps`, `width`, and `height` live on the resource row, not in the body, so
 * they are unavailable here — duration comes from the clips.
 */
export interface TimelineDocument {
  tracks: TimelineTrackData[];
  clips: TimelineClipData[];
  markers: TimelineMarkerData[];
  transcript?: TranscriptLine[];
  scriptEnabled?: boolean;
}

/** Serializable view of one clip. */
export interface TimelineClipNode {
  id: string;
  trackId: string;
  /** Name of the clip's track, or null when the track is gone. */
  trackName: string | null;
  name: string;
  startMs: number;
  durationMs: number;
  mediaType: TimelineMediaType;
  status: TimelineClipStatus;
  locked: boolean;
  muted?: boolean;
  hidden?: boolean;
  prompt?: string;
  model?: string;
  provider?: string;
  /** Set when the clip travels with a sibling (video + its extracted audio). */
  linkId?: string;
  /** Whether a rendered asset is attached, so the agent can tell empty from done. */
  hasAsset: boolean;
}

/** Serializable view of one track. */
export interface TimelineTrackNode {
  id: string;
  name: string;
  type: TimelineTrackType;
  index: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  clipCount: number;
}

/** What the agent reads to answer questions about the sequence. */
export interface TimelineSnapshot {
  sequenceId: string;
  title: string;
  durationMs: number;
  trackCount: number;
  clipCount: number;
  playheadMs: number;
  selectedClipIds: string[];
  /** Whether the document has unsaved edits the user still has to save. */
  dirty: boolean;
  tracks: TimelineTrackNode[];
  clips: TimelineClipNode[];
  markers: { id: string; timeMs: number; label: string }[];
  /**
   * Transcript lines and the clips they own. Clips a line references cannot be
   * deleted or split, so the agent needs to see the constraint before it plans.
   */
  transcript: { id: string; text: string; clipIds: string[] }[];
}

// ── Edit inputs ─────────────────────────────────────────────────────────────

export interface TimelineAddTextClipInput {
  text: string;
  trackId?: string;
  startMs?: number;
  durationMs?: number;
  style?: Partial<Omit<ClipTextStyle, 'text'>>;
}

export interface TimelineAddShapeClipInput {
  shape: ClipShapeStyle;
  trackId?: string;
  startMs?: number;
  durationMs?: number;
}

export interface TimelineMovePatch {
  startMs?: number;
  trackId?: string;
}

export interface TimelineTrimPatch {
  durationMs?: number;
  inPointMs?: number;
  outPointMs?: number;
}

/**
 * Render/audio params plus the generation binding. Changing any binding field
 * marks a generated clip `stale` (see `timelineEdits.ts`), so the user is never
 * shown "generated" over an asset that no longer matches its prompt.
 */
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
  textStyle?: ClipTextStyle;
  shapeStyle?: ClipShapeStyle;
  prompt?: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
  voice?: string;
  width?: number;
  height?: number;
  strength?: number;
  numInferenceSteps?: number;
  seed?: number;
}

export interface TimelineAddMarkerInput {
  timeMs: number;
  label?: string;
  color?: string;
  note?: string;
}

/**
 * Operations the mounted TimelineViewerScreen exposes to the tool layer. Clips
 * and tracks are addressed by id, case-insensitive name, or the literal
 * `"selected"` (clips only).
 */
export interface TimelineAgentHandler {
  getSnapshot: () => TimelineSnapshot;
  getClip: (target: string) => TimelineClipNode;
  /** Select a clip, or clear the selection with null. */
  selectClip: (target: string | null) => TimelineClipNode | null;
  /** Move the playhead and return the resulting position (ms). */
  seek: (timeMs: number) => number;

  addTrack: (type: TimelineTrackType, name?: string) => TimelineTrackNode;
  addTextClip: (input: TimelineAddTextClipInput) => TimelineClipNode;
  addShapeClip: (input: TimelineAddShapeClipInput) => TimelineClipNode;
  /** Moves the whole link group by one delta; returns every clip that moved. */
  moveClip: (target: string, patch: TimelineMovePatch) => TimelineClipNode[];
  /** All-or-nothing across the link group. */
  trimClip: (target: string, patch: TimelineTrimPatch) => TimelineClipNode[];
  /** Splits the clip and every link sibling at the same point. */
  splitClip: (target: string, atMs?: number) => TimelineClipNode[];
  deleteClip: (target: string) => TimelineClipNode;
  /** Duplicates the clip, or the whole link group when it has one. */
  duplicateClip: (target: string, gapMs?: number) => TimelineClipNode[];
  setClipParams: (
    target: string,
    patch: TimelineClipParamsPatch
  ) => TimelineClipNode;
  addMarker: (input: TimelineAddMarkerInput) => TimelineMarkerData;
  deleteMarker: (target: string) => TimelineMarkerData;
  rename: (name: string) => { title: string };
  save: () => Promise<{ ok: true; updatedAt: string | null }>;
}

/** Sequence length: the end of the last clip. Zero when there are none. */
export function timelineDurationMs(clips: readonly TimelineClipData[]): number {
  return clips.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0
  );
}

export function clipToNode(
  clip: TimelineClipData,
  trackName: string | null
): TimelineClipNode {
  return {
    id: clip.id,
    trackId: clip.trackId,
    trackName,
    name: clip.name,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    mediaType: clip.mediaType,
    status: clip.status,
    locked: clip.locked,
    muted: clip.muted,
    hidden: clip.hidden,
    prompt: clip.prompt,
    model: clip.model,
    provider: clip.provider,
    linkId: clip.linkId,
    hasAsset: clip.currentAssetId != null && clip.currentAssetId.length > 0,
  };
}

export function trackToNode(
  track: TimelineTrackData,
  clipCount: number
): TimelineTrackNode {
  return {
    id: track.id,
    name: track.name,
    type: track.type,
    index: track.index,
    visible: track.visible,
    locked: track.locked,
    muted: track.muted,
    clipCount,
  };
}

/**
 * Resolve an agent-supplied clip address: a clip id, a clip name
 * (case-insensitive), or `"selected"`.
 *
 * Throws naming the clips that do exist — the message is the agent's only way
 * to recover from a bad guess.
 */
export function resolveClip(
  clips: readonly TimelineClipData[],
  target: string,
  selectedClipIds: readonly string[]
): TimelineClipData {
  const wanted = target === 'selected' ? (selectedClipIds[0] ?? '') : target;
  if (wanted === '') {
    throw new Error(
      'No clip is selected. Pass a clip id or clip name instead of "selected".'
    );
  }

  const byId = clips.find((clip) => clip.id === wanted);
  if (byId) {
    return byId;
  }

  const lowered = wanted.toLowerCase();
  const byName = clips.find((clip) => clip.name.toLowerCase() === lowered);
  if (byName) {
    return byName;
  }

  const known = clips.map((clip) => `${clip.id} ("${clip.name}")`).join(', ');
  throw new Error(
    `No clip matches "${target}". Use a clip id, a clip name, or "selected". ` +
      (known.length > 0
        ? `Clips: ${known}.`
        : 'This sequence has no clips yet.')
  );
}

/**
 * Resolve a track address: an id or a case-insensitive name. Never returns the
 * raw string — writing a track *name* into `clip.trackId` would orphan the clip.
 */
export function resolveTrack(
  tracks: readonly TimelineTrackData[],
  target: string
): TimelineTrackData {
  const byId = tracks.find((track) => track.id === target);
  if (byId) {
    return byId;
  }

  const lowered = target.toLowerCase();
  const byName = tracks.find((track) => track.name.toLowerCase() === lowered);
  if (byName) {
    return byName;
  }

  const known = tracks.map((track) => `${track.id} ("${track.name}")`).join(', ');
  throw new Error(
    `No track matches "${target}". Use a track id or a track name. ` +
      (known.length > 0
        ? `Tracks: ${known}.`
        : 'This sequence has no tracks yet.')
  );
}

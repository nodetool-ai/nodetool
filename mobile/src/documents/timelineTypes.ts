/**
 * The agent-facing timeline contract on mobile.
 *
 * Ported from web's `timelineAgentBridge`, trimmed to reads: snapshot, clip
 * lookup, selection, seek. Editing, generation, and rendering are deliberately
 * absent — a phone screen cannot supervise a render job, and a timeline is too
 * dense to cut accurately with a thumb, so mobile opens sequences read-only
 * (`kinds.ts` marks the surface `viewer`).
 *
 * Everything crossing the bridge is a plain serializable value, so the tool
 * layer never touches a Zustand handle.
 */

export type TimelineTrackType = 'video' | 'audio' | 'overlay' | 'subtitle';

export type TimelineMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'overlay'
  | 'text'
  | 'shape';

export type TimelineClipStatus =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'generated'
  | 'stale'
  | 'failed'
  | 'locked'
  | 'missing';

export interface TimelineTrackData {
  id: string;
  name: string;
  type: TimelineTrackType;
  index: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  solo?: boolean;
  heightPx?: number;
}

export interface TimelineClipData {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  inPointMs?: number;
  outPointMs?: number;
  mediaType: TimelineMediaType;
  sourceType: 'imported' | 'generated';
  status: TimelineClipStatus;
  locked: boolean;
  muted?: boolean;
  hidden?: boolean;
  prompt?: string;
  provider?: string;
  model?: string;
  currentAssetId?: string;
  thumbnailAssetId?: string;
  /** Generation history. The viewer only shows how many there are. */
  versions: unknown[];
}

export interface TimelineMarkerData {
  id: string;
  timeMs: number;
  label: string;
  color?: string;
  note?: string;
}

/**
 * The timeline document body — the wire shape of `timelineDocument` in
 * `@nodetool-ai/protocol/api-schemas/timeline`. Declared structurally because
 * that module is zod and is not re-exported from the package root, and mobile
 * has no zod. Only the fields the viewer reads are named; the rest ride along
 * untouched.
 *
 * `fps`, `width`, and `height` live on the resource row, not in the body, so
 * they are unavailable here — duration comes from the clips.
 */
export interface TimelineDocument {
  tracks: TimelineTrackData[];
  clips: TimelineClipData[];
  markers: TimelineMarkerData[];
  transcript?: unknown[];
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
  tracks: TimelineTrackNode[];
  clips: TimelineClipNode[];
  markers: { id: string; timeMs: number; label: string }[];
}

/**
 * Operations the mounted TimelineViewerScreen exposes to the tool layer. Clips
 * are addressed by id, case-insensitive name, or the literal `"selected"`.
 */
export interface TimelineAgentHandler {
  getSnapshot: () => TimelineSnapshot;
  getClip: (target: string) => TimelineClipNode;
  /** Select a clip, or clear the selection with null. */
  selectClip: (target: string | null) => TimelineClipNode | null;
  /** Move the playhead and return the resulting position (ms). */
  seek: (timeMs: number) => number;
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
    hasAsset: typeof clip.currentAssetId === 'string' && clip.currentAssetId.length > 0,
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

/**
 * What `nodetool timeline preview` shows: a timeline or a storyboard, read
 * from a JSON file or a database row, reduced to the fields the preview page
 * draws.
 *
 * The source is read again on every page poll, so an agent that rewrites the
 * file or the row sees the page follow. `version` is a hash of the document,
 * which is how the page and the frame cache notice the change.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { TimelineValidation } from "@nodetool-ai/execution/timeline-debug";
import { isFiniteNumber, isRecord, isString } from "@nodetool-ai/cli-common/predicates";
import { documentOf } from "@nodetool-ai/cli-common/document-json";
import {
  resolveTimelineTarget,
  type TimelineSequenceRecord
} from "../timeline-debug/target.js";

/** A `storyboards` row as the preview needs it. */
export interface StoryboardRecord {
  id: string;
  name?: string;
  /** The board's linked timeline, when it was assembled into one. */
  timeline_id?: string | null;
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
}

export interface PreviewSourceDeps {
  loadSequence: (id: string) => Promise<TimelineSequenceRecord | null>;
  loadStoryboard: (id: string) => Promise<StoryboardRecord | null>;
  /** Static validation of a timeline; omitted, the page shows none. */
  validate?: (ref: string) => Promise<TimelineValidation>;
}

export interface TimelinePreview {
  kind: "timeline";
  name: string;
  version: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  totalFrames: number;
  tracks: { id: string; name: string; type: string; clipCount: number }[];
  clips: {
    id: string;
    name: string;
    trackId: string;
    mediaType: string;
    startMs: number;
    durationMs: number;
  }[];
  markers: { timeMs: number; label: string }[];
  validation: TimelineValidation | null;
}

/** A shot's still or take, as a URL the page can load. */
export interface PreviewMedia {
  src: string;
  /** The local asset the URL serves, when it is one. */
  assetId?: string;
}

export interface StoryboardShotPreview {
  id: string;
  index: number;
  slug: string;
  action: string;
  durationSeconds: number | null;
  status: string;
  dialogue: string | null;
  narration: string | null;
  keyframe: PreviewMedia | null;
  clip: PreviewMedia | null;
}

export interface StoryboardPreview {
  kind: "storyboard";
  name: string;
  version: string;
  aspectRatio: string;
  brief: string;
  style: string;
  timelineId: string | null;
  shots: StoryboardShotPreview[];
}

export type PreviewSource = TimelinePreview | StoryboardPreview;

const ASSET_ID = /^[A-Za-z0-9_-]{1,128}$/;

function versionOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "").digest("hex").slice(0, 16);
}

const text = (value: unknown): string => (isString(value) ? value : "");
const textOrNull = (value: unknown): string | null =>
  isString(value) && value.trim() !== "" ? value : null;

/**
 * The URL a media ref loads from: a local asset through the preview server's
 * `/asset/` route, or an http(s) URI as it is. Inline data and temporary
 * handles are not served.
 */
export function previewMediaOf(ref: unknown): PreviewMedia | null {
  if (!isRecord(ref)) {
    return null;
  }
  const uri = text(ref.uri);
  const assetId = isString(ref.asset_id) && ref.asset_id !== ""
    ? ref.asset_id
    : uri.startsWith("asset://")
      ? uri.slice("asset://".length).split(/[/?#]/)[0]
      : undefined;
  if (assetId && ASSET_ID.test(assetId)) {
    return { src: `/asset/${assetId}`, assetId };
  }
  if (/^https?:\/\//i.test(uri)) {
    return { src: uri };
  }
  return null;
}

/** A storyboard document: anything with a `shots` array. */
function storyboardDocumentOf(raw: unknown): Record<string, unknown> | null {
  const document = documentOf(raw);
  return isRecord(document) && Array.isArray(document.shots) ? document : null;
}

function storyboardPreview(
  name: string,
  document: Record<string, unknown>,
  timelineId: string | null
): StoryboardPreview {
  const shots = (document.shots as unknown[]).filter(isRecord);
  return {
    kind: "storyboard",
    name,
    version: versionOf(document),
    aspectRatio: text(document.aspectRatio) || "16:9",
    brief: text(document.brief),
    style: text(document.style),
    timelineId,
    shots: shots
      .map((shot, position) => ({
        id: text(shot.id) || `shot-${position}`,
        index: isFiniteNumber(shot.index) ? shot.index : position,
        slug: text(shot.slug),
        action: text(shot.action),
        durationSeconds: isFiniteNumber(shot.duration_seconds) ? shot.duration_seconds : null,
        status: text(shot.status) || "draft",
        dialogue: textOrNull(shot.dialogue),
        narration: textOrNull(shot.narration),
        keyframe: previewMediaOf(shot.keyframe),
        clip: previewMediaOf(shot.clip)
      }))
      .sort((a, b) => a.index - b.index)
  };
}

async function timelinePreview(
  ref: string,
  deps: PreviewSourceDeps
): Promise<TimelinePreview> {
  const resolved = await resolveTimelineTarget(ref, deps);
  const { document, meta, target } = resolved;
  const fps = meta.fps && meta.fps > 0 ? meta.fps : 30;
  const durationMs =
    meta.durationMs && meta.durationMs > 0
      ? meta.durationMs
      : document.clips.reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0);
  const clipCounts = new Map<string, number>();
  for (const clip of document.clips) {
    clipCounts.set(clip.trackId, (clipCounts.get(clip.trackId) ?? 0) + 1);
  }
  return {
    kind: "timeline",
    name: target.name ?? ref,
    version: versionOf({ document: resolved.raw, meta }),
    fps,
    width: meta.width && meta.width > 0 ? meta.width : 1920,
    height: meta.height && meta.height > 0 ? meta.height : 1080,
    durationMs,
    totalFrames: durationMs > 0 ? Math.max(1, Math.round((durationMs / 1000) * fps)) : 0,
    tracks: document.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      clipCount: clipCounts.get(track.id) ?? 0
    })),
    clips: document.clips.map((clip) => ({
      id: clip.id,
      name: clip.name ?? clip.id,
      trackId: clip.trackId,
      mediaType: clip.mediaType,
      startMs: clip.startMs,
      durationMs: clip.durationMs
    })),
    markers: document.markers.map((marker) => ({ timeMs: marker.timeMs, label: marker.label })),
    validation: deps.validate ? await deps.validate(ref) : null
  };
}

/**
 * Read the preview source. A JSON file whose document has `shots` is a
 * storyboard, and any other file is read as a timeline. An id is looked up as
 * a timeline sequence first, then as a storyboard.
 */
export async function loadPreviewSource(
  ref: string,
  deps: PreviewSourceDeps
): Promise<PreviewSource> {
  if (existsSync(ref)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ref, "utf8"));
    } catch (e) {
      throw new Error(`${ref} is not valid JSON: ${(e as Error).message}`);
    }
    const storyboard = storyboardDocumentOf(parsed);
    if (storyboard) {
      const name = isRecord(parsed) && isString(parsed.name) ? parsed.name : ref;
      const timelineId = isRecord(parsed) && isString(parsed.timeline_id) ? parsed.timeline_id : null;
      return storyboardPreview(name, storyboard, timelineId);
    }
    return timelinePreview(ref, deps);
  }
  if (await deps.loadSequence(ref)) {
    return timelinePreview(ref, deps);
  }
  const row = await deps.loadStoryboard(ref);
  if (!row) {
    throw new Error(`No timeline file, timeline sequence or storyboard matches "${ref}".`);
  }
  const document = storyboardDocumentOf(row);
  if (!document) {
    throw new Error(`Storyboard ${ref} has no shots array in its document.`);
  }
  return storyboardPreview(row.name ?? ref, document, row.timeline_id ?? null);
}

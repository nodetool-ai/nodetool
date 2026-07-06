/**
 * sceneModel — the single source of truth for "what is on screen at time t".
 *
 * Both the live {@link PreviewCompositor} and the offline frame-by-frame
 * {@link renderTimeline} renderer drive their GPU layer lists from
 * {@link computeActiveLayers}, so an exported video is composited from the
 * exact same scene description the user previewed — 1:1 with live.
 *
 * Everything here is pure (no DOM, no GPU, no store access) so it is trivially
 * testable and reusable across the live and render paths.
 */

import type {
  ClipEffect,
  ClipTransform,
  TimelineClip,
  TimelineTrack,
  TrackEffect
} from "@nodetool-ai/timeline";
import type { CompositorBlendMode } from "./gpu/types";

/**
 * Top-of-UI track (lowest `track.index`) renders on top in the composite —
 * matches Premiere / Resolve / FCP. The compositor draws layers from low z to
 * high z, so we invert the UI index. The constant offset keeps numbers
 * positive for DOM placeholder z-indices too.
 */
export const LAYER_Z_BASE = 1000;
export const trackZ = (uiIndex: number): number => LAYER_Z_BASE - uiIndex;

/**
 * Stacking order for overlays drawn on top of the whole preview frame, above
 * every `trackZ` layer. A local scale (not the global `Z_INDEX`/`theme.zIndex`
 * theme scale, whose `commandMenu` at 9999 means the command palette) — these
 * are top-of-preview chrome, semantically distinct from app-level stacking.
 * The magic-generation wash sits below the corner status badges, which sit
 * below the transform gizmo.
 */
export const PREVIEW_OVERLAY_Z = {
  magicWash: 9998,
  badge: 9999,
  gizmo: 10000,
} as const;

/**
 * Synthetic track index assigned to caption layers so they always composite on
 * top of every real track. Words live on their media clip (an audio voiceover
 * or an imported audio/video clip), which can sit on any track — but the
 * caption must stay legible above the picture, so `trackZ(-1)` puts it one
 * step above `LAYER_Z_BASE`.
 */
const CAPTION_TRACK_INDEX = -1;

/**
 * Max simultaneous video layers. The live preview is bounded by its hot
 * HTMLVideoElement pool; the renderer applies the same cap so the exported
 * frame matches what the preview showed when many video clips overlap.
 */
export const MAX_VIDEO_LAYERS = 8;

export function isClipActive(
  clip: TimelineClip,
  currentTimeMs: number
): boolean {
  return (
    currentTimeMs >= clip.startMs &&
    currentTimeMs < clip.startMs + clip.durationMs
  );
}

/**
 * How long clip's head overlaps a preceding same-track clip, in ms (0 if none).
 * `sameTrackClips` must already be filtered to clip's track. Picks the largest
 * overlap when several earlier clips cover the head, and never reports more than
 * clip's own duration.
 */
function headOverlapMs(
  clip: TimelineClip,
  sameTrackClips: TimelineClip[]
): number {
  let overlap = 0;
  for (const prev of sameTrackClips) {
    if (prev === clip || prev.startMs >= clip.startMs) continue;
    const prevEnd = prev.startMs + prev.durationMs;
    if (prevEnd <= clip.startMs) continue; // no overlap
    overlap = Math.max(overlap, prevEnd - clip.startMs);
  }
  return Math.min(overlap, clip.durationMs);
}

/**
 * Opacity multiplier for a clip's incoming cross-fade given the playhead.
 *
 * On the same track the later-starting clip composites on top, so a dissolve is
 * just the incoming clip fading in over the one beneath it — the outgoing clip
 * stays fully opaque (fading it too would bleed the black seed through).
 *
 * - `transitionIn` unset → **auto**: fade in across the overlap with a preceding
 *   same-track clip (the overlap length is the duration). No overlap → 1.
 * - `transitionIn` is a crossfade with `durationMs > 0` → explicit ramp over that
 *   window from the clip's start (independent of overlap; also gives fade-from-
 *   black for a clip with nothing beneath it).
 * - `durationMs <= 0` → opt-out: a zero-length crossfade is a hard cut, so 1
 *   even when the clips overlap.
 *
 * `sameTrackClips` must already be filtered to clip's track.
 */
export function crossfadeOpacity(
  clip: TimelineClip,
  sameTrackClips: TimelineClip[],
  currentTimeMs: number
): number {
  const t = clip.transitionIn;
  let durationMs: number;
  if (t) {
    if (t.durationMs <= 0) return 1; // explicit hard cut
    durationMs = t.durationMs;
  } else {
    durationMs = headOverlapMs(clip, sameTrackClips);
    if (durationMs <= 0) return 1; // auto, but nothing to cross-fade with
  }
  const intoClip = currentTimeMs - clip.startMs;
  if (intoClip <= 0) return 0;
  if (intoClip >= durationMs) return 1;
  return intoClip / durationMs;
}

/** The asset id that should be drawn for a clip in its current status. */
export function effectiveAssetId(clip: TimelineClip): string | undefined {
  switch (clip.status) {
    case "generated":
    case "stale":
    case "locked":
    case "generating":
      return clip.currentAssetId;
    default:
      return undefined;
  }
}

function resolveBlendMode(
  b: TimelineClip["blendMode"]
): CompositorBlendMode {
  return b ?? "normal";
}

/**
 * The source-media time (seconds) a clip's video element should display at
 * timeline position `currentTimeMs`. Honors the clip's in-point and speed
 * (unless the speed change is already baked into the asset). Shared by the
 * live preview's seek scheduling and the renderer's deterministic seeking so
 * the same frame is shown in both.
 */
export function clipSourceTimeSec(
  clip: TimelineClip,
  currentTimeMs: number
): number {
  const rate = clip.speedBaked
    ? 1
    : Math.max(0.0001, clip.speedMultiplier ?? 1);
  const intoClipTimelineSec = (currentTimeMs - clip.startMs) / 1000;
  return Math.max(0, intoClipTimelineSec * rate + (clip.inPointMs ?? 0) / 1000);
}

/** One word of a caption resolved at a point in time. */
export interface ResolvedCaptionWord {
  text: string;
  /** True while the playhead is inside this word's spoken interval. */
  active: boolean;
}

/** A caption's full per-frame state: every word of the line plus which one is
 * currently spoken. Rasterised identically by the live preview and the export
 * (see `captionRender`). */
export interface ResolvedCaption {
  words: ResolvedCaptionWord[];
}

/**
 * Resolve a clip's caption to its on-screen word state at `currentTimeMs`.
 * Returns `undefined` for clips that carry no caption. Word timings are
 * clip-local (relative to `clip.startMs`), so moving or splitting the clip
 * needs no rewrite of the words.
 */
export function resolveCaptionAtTime(
  clip: TimelineClip,
  currentTimeMs: number
): ResolvedCaption | undefined {
  if (!clip.caption) return undefined;
  const local = currentTimeMs - clip.startMs;
  return {
    words: clip.caption.words.map((w) => ({
      text: w.word,
      active: local >= w.startMs && local < w.endMs
    }))
  };
}

/** A visual layer active at a point in time, in bottom-to-top composite order. */
export interface ActiveLayer {
  kind: "video" | "image" | "caption";
  clip: TimelineClip;
  clipId: string;
  trackIndex: number;
  blendMode: CompositorBlendMode;
  /** Final opacity including the clip base opacity and any transition ramp. */
  opacity: number;
  /** Asset to draw, or undefined when the clip has no usable render yet. */
  assetId: string | undefined;
  transform?: ClipTransform;
  borderRadius?: number;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
  /** Present only when `kind === "caption"`: the words to draw this frame. */
  caption?: ResolvedCaption;
}

export interface ComputeActiveLayersOptions {
  /** Cap on simultaneous video layers. Defaults to {@link MAX_VIDEO_LAYERS}. */
  maxVideoLayers?: number;
}

/**
 * Result of {@link computeActiveLayersWithHorizon}: the resolved layers plus
 * the change horizon (see that function for what the horizon means).
 */
export interface ActiveLayersResult {
  layers: ActiveLayer[];
  /**
   * The minimum time (ms), strictly greater than the query `currentTimeMs`,
   * at which the resolved layer set OR any layer's active caption word could
   * change. `Number.POSITIVE_INFINITY` when nothing upcoming would change it.
   * Callers may treat `layers` as valid for any query time in
   * `[currentTimeMs, nextChangeMs)` without recomputing.
   */
  nextChangeMs: number;
}

/**
 * Resolve every layer active at `currentTimeMs`, in the order the compositor
 * should blend them: media layers first (bottom track first, top track last),
 * then caption layers appended on top. Also computes the change horizon (see
 * {@link ActiveLayersResult}), so a caller driving a per-frame loop (the live
 * preview's rAF tick) can skip recomputation while the query time stays below
 * it and the input arrays are unchanged — steady-state playback inside a
 * clip's middle (no boundary crossed, no caption word transition) becomes a
 * single float compare instead of re-deriving the whole scene.
 *
 * Captions are sourced from any active clip that carries word-level
 * `caption.words` — the voiceover audio clip or an imported audio/video clip —
 * regardless of its track type, and are given {@link CAPTION_TRACK_INDEX} so
 * they always composite above the picture. A clip that carries a caption but
 * has no drawable asset (a caption-only overlay) contributes only the caption;
 * a captioned video contributes both its picture and its caption. Audio clips
 * never contribute a media layer.
 *
 * Video layers are capped to keep parity with the live preview's video pool;
 * the cap is applied in composite order (top tracks win, matching the preview
 * which fills slots while iterating top-to-bottom).
 */
export function computeActiveLayersWithHorizon(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  currentTimeMs: number,
  options: ComputeActiveLayersOptions = {}
): ActiveLayersResult {
  const maxVideoLayers = options.maxVideoLayers ?? MAX_VIDEO_LAYERS;

  const sortedTracks = [...tracks].sort((a, b) => a.index - b.index);
  const clipsByTrackId = new Map<string, TimelineClip[]>();
  for (const c of clips) {
    const arr = clipsByTrackId.get(c.trackId);
    if (arr) arr.push(c);
    else clipsByTrackId.set(c.trackId, [c]);
  }

  const mediaLayers: ActiveLayer[] = [];
  const captionLayers: ActiveLayer[] = [];
  let videoCount = 0;

  // Change horizon: the smallest upcoming time at which `isClipActive`,
  // `resolveCaptionAtTime`'s active-word index, or the active-layer set could
  // flip for ANY input considered below. Tracked alongside the existing scan
  // so steady-state callers pay nothing extra beyond a few comparisons.
  let nextChangeMs = Number.POSITIVE_INFINITY;
  const considerBoundary = (ms: number): void => {
    if (ms > currentTimeMs && ms < nextChangeMs) nextChangeMs = ms;
  };

  for (const track of sortedTracks) {
    if (!track.visible) continue;
    const isVisual = track.type === "video" || track.type === "overlay";
    const trackClips = clipsByTrackId.get(track.id) ?? [];

    // Any clip starting on this track (active or not) can add a layer —
    // mirrors `isClipActive`'s `>=` boundary at `startMs`.
    for (const c of trackClips) {
      considerBoundary(c.startMs);
    }

    const activeClips = trackClips
      .filter((c) => isClipActive(c, currentTimeMs))
      .sort((a, b) => a.startMs - b.startMs);

    for (const clip of activeClips) {
      // Mirrors `isClipActive`'s `<` boundary: the clip stops being active
      // (and its layer disappears) exactly at its end.
      considerBoundary(clip.startMs + clip.durationMs);

      const baseOpacity = clip.opacity ?? 1;
      // During an overlap both clips are active, so `activeClips` already holds
      // the preceding clip the auto-crossfade ramps against.
      const opacity =
        baseOpacity * crossfadeOpacity(clip, activeClips, currentTimeMs);

      // Captions ride on their media clip and always render on top.
      const caption = resolveCaptionAtTime(clip, currentTimeMs);
      if (caption) {
        if (clip.caption) {
          // Mirrors `resolveCaptionAtTime`'s word boundaries: the active
          // word's end and the next word's start each flip which word index
          // is reported active.
          const local = currentTimeMs - clip.startMs;
          for (const w of clip.caption.words) {
            if (local >= w.startMs && local < w.endMs) {
              considerBoundary(clip.startMs + w.endMs);
            } else if (w.startMs > local) {
              considerBoundary(clip.startMs + w.startMs);
            }
          }
        }

        captionLayers.push({
          kind: "caption",
          clip,
          clipId: clip.id,
          trackIndex: CAPTION_TRACK_INDEX,
          blendMode: resolveBlendMode(clip.blendMode),
          opacity,
          assetId: undefined,
          transform: clip.transform,
          caption
        });
      }

      // Only visual tracks draw picture; audio clips never do.
      if (!isVisual) continue;
      if (clip.mediaType === "audio") continue;

      const assetId = effectiveAssetId(clip);
      // A caption-only clip (no drawable asset) contributes just its caption.
      if (caption && assetId === undefined) continue;

      const common = {
        clip,
        clipId: clip.id,
        trackIndex: track.index,
        blendMode: resolveBlendMode(clip.blendMode),
        opacity,
        assetId,
        transform: clip.transform,
        borderRadius: clip.borderRadius,
        effects: clip.effects,
        trackEffects: track.effects
      } satisfies Omit<ActiveLayer, "kind">;

      if (clip.mediaType === "image") {
        mediaLayers.push({ kind: "image", ...common });
      } else {
        // video | overlay
        if (common.assetId) {
          if (videoCount >= maxVideoLayers) continue;
          videoCount += 1;
        }
        mediaLayers.push({ kind: "video", ...common });
      }
    }
  }

  return { layers: [...mediaLayers, ...captionLayers], nextChangeMs };
}

/**
 * {@link computeActiveLayersWithHorizon}, discarding the change horizon. Kept
 * as the stable entry point for callers that only need the layer set (the
 * offline renderer, tests) — its signature must stay a plain `ActiveLayer[]`
 * return.
 */
export function computeActiveLayers(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  currentTimeMs: number,
  options: ComputeActiveLayersOptions = {}
): ActiveLayer[] {
  return computeActiveLayersWithHorizon(tracks, clips, currentTimeMs, options)
    .layers;
}

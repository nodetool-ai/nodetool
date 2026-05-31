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
 * Opacity multiplier for a clip given the playhead position. Implements the
 * incoming `transitionIn` ramp (0→1 over `durationMs`). Returns 1 when no
 * transition applies. Crossfade is the only type currently supported.
 */
export function transitionOpacity(
  clip: TimelineClip,
  currentTimeMs: number
): number {
  const t = clip.transitionIn;
  if (!t || t.durationMs <= 0) return 1;
  const intoClip = currentTimeMs - clip.startMs;
  if (intoClip >= t.durationMs) return 1;
  if (intoClip <= 0) return 0;
  return intoClip / t.durationMs;
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

export function resolveBlendMode(
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

/** A visual layer active at a point in time, in bottom-to-top composite order. */
export interface ActiveLayer {
  kind: "video" | "image";
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
}

export interface ComputeActiveLayersOptions {
  /** Cap on simultaneous video layers. Defaults to {@link MAX_VIDEO_LAYERS}. */
  maxVideoLayers?: number;
}

/**
 * Resolve every visual layer active at `currentTimeMs`, in the order the
 * compositor should blend them (bottom track first, top track last). Audio
 * clips and subtitle tracks are excluded — they are not GPU layers.
 *
 * Video layers are capped to keep parity with the live preview's video pool;
 * the cap is applied in composite order (top tracks win, matching the preview
 * which fills slots while iterating top-to-bottom).
 */
export function computeActiveLayers(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  currentTimeMs: number,
  options: ComputeActiveLayersOptions = {}
): ActiveLayer[] {
  const maxVideoLayers = options.maxVideoLayers ?? MAX_VIDEO_LAYERS;

  const sortedTracks = [...tracks].sort((a, b) => a.index - b.index);
  const clipsByTrackId = new Map<string, TimelineClip[]>();
  for (const c of clips) {
    const arr = clipsByTrackId.get(c.trackId);
    if (arr) arr.push(c);
    else clipsByTrackId.set(c.trackId, [c]);
  }

  const layers: ActiveLayer[] = [];
  let videoCount = 0;

  for (const track of sortedTracks) {
    if (!track.visible) continue;
    if (track.type !== "video" && track.type !== "overlay") continue;

    const activeClips = (clipsByTrackId.get(track.id) ?? [])
      .filter((c) => isClipActive(c, currentTimeMs))
      .sort((a, b) => a.startMs - b.startMs);

    for (const clip of activeClips) {
      if (clip.mediaType === "audio") continue;

      const baseOpacity = clip.opacity ?? 1;
      const opacity = baseOpacity * transitionOpacity(clip, currentTimeMs);
      const common = {
        clip,
        clipId: clip.id,
        trackIndex: track.index,
        blendMode: resolveBlendMode(clip.blendMode),
        opacity,
        assetId: effectiveAssetId(clip),
        transform: clip.transform,
        borderRadius: clip.borderRadius,
        effects: clip.effects,
        trackEffects: track.effects
      } satisfies Omit<ActiveLayer, "kind">;

      if (clip.mediaType === "image") {
        layers.push({ kind: "image", ...common });
      } else {
        // video | overlay
        if (videoCount >= maxVideoLayers) continue;
        videoCount += 1;
        layers.push({ kind: "video", ...common });
      }
    }
  }

  return layers;
}

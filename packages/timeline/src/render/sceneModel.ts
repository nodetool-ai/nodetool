/**
 * sceneModel — the single source of truth for "what is on screen at time t".
 *
 * The live preview, the browser's offline exporter, and the server-side
 * `RenderTimeline` node all drive their layer lists from
 * {@link computeActiveLayers}, so an exported video is composited from the
 * exact same scene description the user previewed — 1:1 with live, wherever
 * the render runs.
 *
 * Everything here is pure (no DOM, no GPU, no store access) so it is trivially
 * testable and reusable across every render path.
 */

import type {
  ClipEffect,
  ClipMask,
  ClipTransform,
  TimelineClip,
  TimelineTrack,
  TrackEffect
} from "../types.js";
import type {
  AnimationSample,
  AnimationSampleMask,
  ClipAnimation,
  CompiledAnimation,
  StaggerUnit
} from "../animation/index.js";
import {
  compileClipAnimations,
  hasActiveAnimationWindow,
  hasStaggeredAnimation,
  isIdentitySample,
  parseStaggerUnit,
  sampleAnimations
} from "../animation/index.js";
import { clipRemapSourceMs } from "../timeRemap.js";
import type { ResolvedCaption, TextRenderStagger } from "./draw.js";
import { countTextStaggerUnits, type RenderCanvas } from "./textLayout.js";
import { buildTransformMatrix } from "./transform.js";
import { resolveTransition, type ResolvedTransition } from "./transition.js";

/** Clamp a resolved opacity into the range both compositors agree on. */
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Blend mode a layer composites with. */
export type CompositorBlendMode = NonNullable<TimelineClip["blendMode"]>;

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
  gizmo: 10000
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
 * Opacity multiplier for a clip's incoming transition given the playhead.
 *
 * On the same track the later-starting clip composites on top, so a dissolve is
 * just the incoming clip fading in over the one beneath it — the outgoing clip
 * stays fully opaque (fading it too would bleed the black seed through).
 *
 * - `transitionIn` unset → **auto**: fade in across the overlap with a preceding
 *   same-track clip (the overlap length is the duration). No overlap → 1.
 * - `transitionIn` set with `durationMs > 0` → explicit ramp over that window
 *   from the clip's start (independent of overlap; also gives fade-from-black
 *   for a clip with nothing beneath it).
 * - `durationMs <= 0` → opt-out: a zero-length transition is a hard cut, so 1
 *   even when the clips overlap.
 *
 * The incoming half of {@link resolveTransition}, kept as its own name because
 * "how visible is this clip mid-dissolve" is the question every caller outside
 * the compositors asks.
 *
 * `sameTrackClips` must already be filtered to clip's track.
 */
export function crossfadeOpacity(
  clip: TimelineClip,
  sameTrackClips: TimelineClip[],
  currentTimeMs: number
): number {
  return resolveTransition(clip, sameTrackClips, currentTimeMs)?.incoming
    .opacity ?? 1;
}

/**
 * Every cut in flight on one track at `currentTimeMs`, keyed by the clip whose
 * layer carries it. `activeClips` must be one track's active clips in start
 * order — during an overlap both sides are active, which is what lets the
 * outgoing partner be found without walking the whole document.
 *
 * A clip can be on both sides at once when its own transition has not finished
 * before the next one starts. Its own (incoming) record wins the geometry,
 * because that is the cut it declares; the two opacities multiply, so it still
 * leaves as the next clip arrives.
 */
function resolveTrackTransitions(
  activeClips: readonly TimelineClip[],
  currentTimeMs: number
): Map<string, ResolvedTransition> {
  const byClipId = new Map<string, ResolvedTransition>();
  for (const clip of activeClips) {
    const pair = resolveTransition(clip, activeClips, currentTimeMs);
    if (!pair) continue;
    const outgoing = pair.outgoing;
    if (outgoing && pair.outgoingClip) {
      const id = pair.outgoingClip.id;
      const existing = byClipId.get(id);
      byClipId.set(
        id,
        existing
          ? { ...existing, opacity: existing.opacity * outgoing.opacity }
          : outgoing
      );
    }
    const existing = byClipId.get(clip.id);
    byClipId.set(
      clip.id,
      existing
        ? { ...pair.incoming, opacity: pair.incoming.opacity * existing.opacity }
        : pair.incoming
    );
  }
  return byClipId;
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

function resolveBlendMode(b: TimelineClip["blendMode"]): CompositorBlendMode {
  return b ?? "normal";
}

/**
 * The source-media time (seconds) a clip's video element should display at
 * timeline position `currentTimeMs`. Honors the clip's in-point and speed
 * (unless the speed change is already baked into the asset). Shared by the
 * live preview's seek scheduling and the renderer's deterministic seeking so
 * the same frame is shown in both.
 *
 * A clip carrying a `timeRemap` reads its source position off that curve
 * instead (D13): the keyframes name absolute source milliseconds, so neither
 * the rate nor the in-point applies on top of them.
 */
export function clipSourceTimeSec(
  clip: TimelineClip,
  currentTimeMs: number
): number {
  const remapped = clipRemapSourceMs(clip, currentTimeMs);
  if (remapped !== null) return Math.max(0, remapped / 1000);
  const rate = clip.speedBaked
    ? 1
    : Math.max(0.0001, clip.speedMultiplier ?? 1);
  const intoClipTimelineSec = (currentTimeMs - clip.startMs) / 1000;
  return Math.max(0, intoClipTimelineSec * rate + (clip.inPointMs ?? 0) / 1000);
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
    })),
    style: clip.caption.style
  };
}

// ── Groups (transform parents) ───────────────────────────────────────────────

/**
 * A group clip resolved at one point in time (D4). A group carries no media:
 * it exists so the clips naming it with `parentId` inherit one transform, one
 * opacity and one window.
 */
export interface ResolvedGroup {
  /**
   * The group's clip-space matrix, with its own ancestors already composed in.
   * Absent when the caller supplied no canvas — a transform is expressed
   * against the sequence resolution, so there is no matrix without one.
   */
  matrix?: Float32Array;
  /**
   * The opacity a child of this group inherits, its ancestors' already
   * multiplied in. A precompositing group hands its children 1 and applies its
   * own opacity once, when the composed surface blends.
   */
  opacity: number;
  /** Absolute timeline window children are clipped to (`[startMs, endMs)`). */
  window: { startMs: number; endMs: number };
  /**
   * Set when the group's parent chain loops back on itself. The chain is
   * refused rather than followed: every group on it resolves as if it had no
   * parent, so a cyclic document renders instead of hanging. The validator
   * reports it as `parent_cycle`.
   */
  cycle?: boolean;
  /**
   * The intermediate surface a child of this group draws into: this group's own
   * id when it precomposites, otherwise whatever its parent named. Absent when
   * no group on the chain precomposites — the ordinary path, where children go
   * straight onto the main stack.
   */
  surfaceId?: string;
  /** Set when this group composites its children before blending them. */
  precomposite?: GroupPrecomposite;
}

/** How a precompositing group's composed surface blends into what is beneath. */
export interface GroupPrecomposite {
  /** The group's own opacity, its ancestors' already multiplied in. */
  opacity: number;
  blendMode: CompositorBlendMode;
  /** The group's effect chain, run once on the composed surface. */
  effects?: ClipEffect[];
  /**
   * The surface this one blends into, when a precompositing group holds this
   * group. Absent when it blends onto the frame.
   */
  parentSurfaceId?: string;
}

/**
 * Whether a group has to composite its children into an intermediate surface
 * before they blend.
 *
 * Only two things make that necessary: an effect, which has to run on the
 * composed picture rather than on each child, and a blend mode, which has to
 * meet the frame once rather than once per child. Opacity is deliberately not
 * one of them — multiplying it into each child is what the group already does,
 * and a surface per group would cost a frame-sized allocation on every
 * document that uses grouping at all.
 */
export function groupNeedsPrecomposite(group: TimelineClip): boolean {
  if (resolveBlendMode(group.blendMode) !== "normal") return true;
  return (group.effects ?? []).some((effect) => effect.enabled);
}

/** Every group clip in a document, resolved. Keyed by clip id. */
export type ResolvedGroups = Map<string, ResolvedGroup>;

/** A group's own transform and opacity at `currentTimeMs`, animations folded in. */
function groupProps(
  group: TimelineClip,
  currentTimeMs: number,
  canvas: RenderCanvas | undefined,
  cache: AnimationCompileCache | undefined
): { transform?: ClipTransform; opacity: number } {
  const layer = {
    clip: group,
    transform: group.transform,
    opacity: group.opacity ?? 1
  };
  if (!canvas) return layer;
  const animated = resolveAnimatedLayerProps(layer, currentTimeMs, canvas, cache);
  return { transform: animated.transform, opacity: animated.opacity };
}

/**
 * Resolve every group clip at `currentTimeMs`, parents before children.
 *
 * A group may itself name a parent, so each one is resolved by walking its
 * parent chain up to the first ancestor already resolved (or to a clip that is
 * not a group), then folding back down: matrices compose `parent × own`,
 * opacities multiply, windows intersect. Resolution is independent of tracks —
 * a group parents by id, and I9 keeps z-order the child's own track's.
 *
 * A chain that revisits a group it already walked is a cycle. It is refused,
 * not followed: every group on that chain resolves unparented and carries
 * `cycle`, which is what stops this from recursing forever on a document that
 * names a parent in a loop.
 */
export function resolveGroups(
  clips: readonly TimelineClip[],
  currentTimeMs: number,
  canvas?: RenderCanvas,
  cache?: AnimationCompileCache
): ResolvedGroups {
  const groupById = new Map<string, TimelineClip>();
  for (const clip of clips) {
    if (clip.mediaType === "group") groupById.set(clip.id, clip);
  }

  const resolved: ResolvedGroups = new Map();
  for (const group of groupById.values()) {
    if (resolved.has(group.id)) continue;

    const chain: TimelineClip[] = [];
    const walked = new Set<string>();
    let cursor: TimelineClip | undefined = group;
    let cycle = false;
    while (cursor && !resolved.has(cursor.id)) {
      if (walked.has(cursor.id)) {
        cycle = true;
        break;
      }
      walked.add(cursor.id);
      chain.push(cursor);
      cursor = cursor.parentId ? groupById.get(cursor.parentId) : undefined;
    }

    // Fold from the ancestor end of the chain back down to `group`.
    let inherited = cursor ? resolved.get(cursor.id) : undefined;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const current = chain[i]!;
      // A chain that reaches a cycle cannot say what any of its links inherit,
      // so none of them inherit anything.
      const parent = cycle ? undefined : inherited;
      const own = groupProps(current, currentTimeMs, canvas, cache);
      const precompose = groupNeedsPrecomposite(current);
      const folded = (parent?.opacity ?? 1) * own.opacity;
      const entry: ResolvedGroup = {
        // A precompositing group hands its children full opacity: its own is
        // applied once, to the composed surface, which is the whole point of
        // the intermediate — two overlapping children must not each be dimmed.
        opacity: precompose ? 1 : folded,
        window: {
          startMs: Math.max(
            current.startMs,
            parent?.window.startMs ?? Number.NEGATIVE_INFINITY
          ),
          endMs: Math.min(
            current.startMs + current.durationMs,
            parent?.window.endMs ?? Number.POSITIVE_INFINITY
          )
        }
      };
      if (canvas) {
        entry.matrix = buildTransformMatrix(
          own.transform ?? IDENTITY_TRANSFORM,
          // A group has no source to fit, so its matrix is a pure clip-space
          // transform: the identity base makes its anchor and position mean
          // the frame, not a bitmap.
          { x: 1, y: 1 },
          canvas.width,
          canvas.height,
          parent?.matrix
        );
      }
      if (cycle) entry.cycle = true;
      if (precompose) {
        entry.surfaceId = current.id;
        entry.precomposite = {
          opacity: folded,
          blendMode: resolveBlendMode(current.blendMode),
          effects: current.effects,
          parentSurfaceId: parent?.surfaceId
        };
      } else {
        entry.surfaceId = parent?.surfaceId;
      }
      resolved.set(current.id, entry);
      inherited = entry;
    }
  }
  return resolved;
}

/** Channels of a matte source that can drive a layer's alpha (D6). */
export const MATTE_MODES = ["alpha", "luma"] as const;

export type MatteMode = (typeof MATTE_MODES)[number];

/**
 * Narrow a document's matte `mode` to one this build applies, or `null` for one
 * it does not — which the scene model leaves unmatted, the way an unknown
 * transition type falls back to a cross-fade (I2).
 */
export function parseMatteMode(mode: string): MatteMode | null {
  return (MATTE_MODES as readonly string[]).includes(mode)
    ? (mode as MatteMode)
    : null;
}

/** A track matte resolved at one point in time: the source layer and how to read it. */
export interface ResolvedMatte {
  mode: MatteMode;
  invert: boolean;
  /**
   * The matte source, resolved exactly as if it were drawing itself. A
   * compositor renders it to its own surface and reads the named channel out
   * of it; it never reaches the frame.
   */
  layer: ActiveLayer;
}

/** A visual layer active at a point in time, in bottom-to-top composite order. */
export interface ActiveLayer {
  kind: "video" | "image" | "text" | "shape" | "caption";
  clip: TimelineClip;
  clipId: string;
  trackIndex: number;
  blendMode: CompositorBlendMode;
  /** Final opacity including the clip base opacity and any transition ramp. */
  opacity: number;
  /** Asset to draw, or undefined when the clip has no usable render yet. */
  assetId: string | undefined;
  transform?: ClipTransform;
  /**
   * The resolved matrix of the group this clip names with `parentId`, or
   * absent when it names none. A compositor passes it to
   * `buildTransformMatrix` as the parent of this layer's own transform; the
   * layer's `opacity` already has the group's folded in.
   */
  parentMatrix?: Float32Array;
  /**
   * The intermediate surface this layer draws into instead of the main stack,
   * named by the precompositing group that owns it. Absent on every layer of a
   * document whose groups carry no effects and no blend mode, which is the
   * path that allocates nothing.
   */
  precomposeGroupId?: string;
  borderRadius?: number;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
  /** Present only when `kind === "caption"`: the words to draw this frame. */
  caption?: ResolvedCaption;
  /** Present only when `kind === "text"`: authored text to rasterize. */
  textStyle?: TimelineClip["textStyle"];
  /** Present only when `kind === "shape"`: authored geometry to rasterize. */
  shapeStyle?: TimelineClip["shapeStyle"];
  /**
   * The clip's shape mask, in this layer's own normalized space, applied
   * before it blends (D6). Never set on a caption layer, which composites
   * frame-sized and untransformed and so has no layer space to mask in.
   */
  shapeMask?: ClipMask;
  /**
   * The track matte driving this layer's alpha, with the source clip already
   * resolved to its own layer. The source is not in {@link
   * ActiveLayersResult.layers}: a matte source never draws itself.
   */
  matte?: ResolvedMatte;
  /**
   * The cut this layer is part of, and which side of it the layer is on. The
   * opacity it names is already folded into {@link ActiveLayer.opacity}; the
   * rest — a scale, a frame-relative offset, a reveal mask, the solid a
   * `dipToColor` fades through — is what the compositors draw with, so both
   * express one cut the same way.
   */
  transition?: ResolvedTransition;
}

export interface ComputeActiveLayersOptions {
  /** Cap on simultaneous video layers. Defaults to {@link MAX_VIDEO_LAYERS}. */
  maxVideoLayers?: number;
  /**
   * The sequence's own resolution (and its text metrics), the space a group's
   * transform and animations are authored in. Every render host passes the
   * canvas it already samples animations against. Without it a group's
   * transform cannot become a matrix, so children compose unparented — their
   * window still clips them and the group's opacity still multiplies.
   */
  canvas?: RenderCanvas;
  /** Compile cache for the group clips' own animations. */
  animationCache?: AnimationCompileCache;
}

/** Why a clip that was active at the query time contributed no layer. */
export type DroppedLayerReason =
  | "video_layer_cap"
  /**
   * The clip is matted by a source that draws nothing at this time, so the
   * matte is empty and so is the layer. Reported rather than silently omitted:
   * a matted layer that vanishes for part of a cut is otherwise indistinguishable
   * from one that was never wired up.
   */
  | "matte_source_inactive";

/** A clip the scene model resolved and then left out of the composite. */
export interface DroppedLayer {
  clipId: string;
  reason: DroppedLayerReason;
}

/**
 * Result of {@link computeActiveLayersWithHorizon}: the resolved layers plus
 * the change horizon (see that function for what the horizon means).
 */
/**
 * One precompositing group's composed surface, as a layer of the frame.
 *
 * Every layer naming this group's `clipId` in `precomposeGroupId` draws into
 * the surface instead of onto the main stack; the surface then blends once,
 * here, with the group's own opacity, blend mode and effect chain.
 */
export interface PrecompositeLayer {
  /** The group clip's id. Keys the intermediate surface. */
  clipId: string;
  /** The group clip's own track — the z the surface blends at (I9). */
  trackIndex: number;
  /** The group's opacity, its ancestors' already folded in. */
  opacity: number;
  blendMode: CompositorBlendMode;
  /** Run once on the composed surface, not once per child. */
  effects?: ClipEffect[];
  /** Set when a precompositing group holds this one: the surface it draws into. */
  precomposeGroupId?: string;
}

export interface ActiveLayersResult {
  layers: ActiveLayer[];
  /**
   * The groups that composite their children before blending, innermost first
   * — so a host can build each surface in array order and always find a nested
   * one already finished. Empty unless a group carries effects or a blend mode.
   */
  precomposites: PrecompositeLayer[];
  /**
   * Clips active at the query time that the scene model refused to draw. The
   * layer cap used to discard them with a bare `continue`, so a frame quietly
   * lost a layer and no host could say which one. Every caller that reports
   * what it drew reports these beside it.
   */
  droppedLayers: DroppedLayer[];
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
 * A group clip contributes no layer of its own. Every clip naming one with
 * `parentId` carries the group's matrix as `parentMatrix`, has the group's
 * opacity multiplied into its own, and is left out entirely while the query
 * time sits outside the group's window. A group carrying effects or a blend
 * mode instead contributes a {@link PrecompositeLayer}: its children name it in
 * `precomposeGroupId` and draw into its surface, and the surface blends once.
 *
 * Video layers are capped to keep parity with the live preview's video pool;
 * the cap is applied in composite order (top tracks win, matching the preview
 * which fills slots while iterating top-to-bottom). Each clip the cap turns
 * away is named in `droppedLayers` so a host can say what is missing from the
 * frame instead of showing a picture that quietly lost a layer.
 */
export function computeActiveLayersWithHorizon(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  currentTimeMs: number,
  options: ComputeActiveLayersOptions = {}
): ActiveLayersResult {
  const maxVideoLayers = options.maxVideoLayers ?? MAX_VIDEO_LAYERS;

  // Parents before children: a child's opacity, matrix and window all come
  // from a group that may sit on any track, so every group is resolved before
  // the track walk starts.
  const groups = resolveGroups(
    clips,
    currentTimeMs,
    options.canvas,
    options.animationCache
  );

  const sortedTracks = [...tracks].sort((a, b) => a.index - b.index);
  const clipsByTrackId = new Map<string, TimelineClip[]>();
  for (const c of clips) {
    const arr = clipsByTrackId.get(c.trackId);
    if (arr) arr.push(c);
    else clipsByTrackId.set(c.trackId, [c]);
  }

  const mediaLayers: ActiveLayer[] = [];
  const captionLayers: ActiveLayer[] = [];
  const droppedLayers: DroppedLayer[] = [];
  let videoCount = 0;

  // Matte sources are diverted, not drawn: the clips named by a readable
  // `matte` are held aside as the walk reaches them and handed to the layers
  // that name them once the walk is over — the source may sit on a track below
  // the one that reads it (D6).
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const matteSourceIds = new Set<string>();
  for (const clip of clips) {
    const matte = clip.matte;
    if (!matte || parseMatteMode(matte.mode) === null) continue;
    if (clipById.has(matte.sourceClipId)) matteSourceIds.add(matte.sourceClipId);
  }
  const matteLayers = new Map<string, ActiveLayer>();
  const emitMedia = (layer: ActiveLayer): void => {
    if (matteSourceIds.has(layer.clipId)) matteLayers.set(layer.clipId, layer);
    else mediaLayers.push(layer);
  };
  /**
   * Surfaces an emitted layer actually draws into. A precompositing group with
   * nothing under it at this time is not reported, so no host allocates a
   * frame-sized surface to composite nothing onto.
   */
  const usedSurfaces = new Set<string>();

  // Change horizon: the smallest upcoming time at which `isClipActive`,
  // `resolveCaptionAtTime`'s active-word index, or the active-layer set could
  // flip for ANY input considered below. Tracked alongside the existing scan
  // so steady-state callers pay nothing extra beyond a few comparisons.
  let nextChangeMs = Number.POSITIVE_INFINITY;
  const considerBoundary = (ms: number): void => {
    if (ms > currentTimeMs && ms < nextChangeMs) nextChangeMs = ms;
  };

  // A group window clips children on every track, so its edges move the layer
  // set even when the group itself sits on a track this walk never reaches.
  for (const group of groups.values()) {
    considerBoundary(group.window.startMs);
    considerBoundary(group.window.endMs);
  }

  for (const track of sortedTracks) {
    if (!track.visible) continue;
    const isVisual = track.type === "video" || track.type === "overlay";
    const trackClips = clipsByTrackId.get(track.id) ?? [];

    // Any clip starting on this track (active or not) can add a layer —
    // mirrors `isClipActive`'s `>=` boundary at `startMs`.
    for (const c of trackClips) {
      considerBoundary(c.startMs);
    }

    // A group draws nothing itself: it is a transform parent, and its children
    // carry its contribution to the frame. Leaving it out here also keeps it
    // out of the auto-crossfade's partner list, where an earlier-starting group
    // would otherwise read as the clip beneath its own child.
    const activeClips = trackClips
      .filter((c) => c.mediaType !== "group" && isClipActive(c, currentTimeMs))
      .sort((a, b) => a.startMs - b.startMs);

    // Both sides of every cut in flight on this track, resolved before any
    // layer is emitted: the outgoing record belongs to a clip that was already
    // walked past by the time its partner declares the transition (D5).
    const transitionFor = resolveTrackTransitions(activeClips, currentTimeMs);

    for (const clip of activeClips) {
      // Mirrors `isClipActive`'s `<` boundary: the clip stops being active
      // (and its layer disappears) exactly at its end.
      considerBoundary(clip.startMs + clip.durationMs);

      // A clip whose parent is missing or cyclic renders unparented (D4); the
      // validator is where that is reported.
      const parent = clip.parentId ? groups.get(clip.parentId) : undefined;
      if (
        parent &&
        (currentTimeMs < parent.window.startMs ||
          currentTimeMs >= parent.window.endMs)
      ) {
        continue;
      }
      const parentMatrix = parent?.matrix;
      const precomposeGroupId = parent?.surfaceId;
      if (precomposeGroupId) usedSurfaces.add(precomposeGroupId);

      const transition = transitionFor.get(clip.id);
      const baseOpacity = (clip.opacity ?? 1) * (parent?.opacity ?? 1);
      // Clamped here and nowhere else: the GPU compositor multiplies this into
      // the shader raw while Canvas 2D clamps it, so an out-of-range clip or
      // group opacity drew a different picture on each host. Animations still
      // multiply on top afterwards (I3) — `clampSample` settles those.
      const opacity = clamp01(baseOpacity * (transition?.opacity ?? 1));

      // Captions ride on their media clip and always render on top.
      const caption = resolveCaptionAtTime(clip, currentTimeMs);
      if (caption && !matteSourceIds.has(clip.id)) {
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
          parentMatrix,
          precomposeGroupId,
          // A caption is drawn frame-sized and untransformed, so it takes the
          // cut's opacity (already in `opacity`) and none of its geometry.
          caption
        });
      }

      // Only visual tracks draw picture; audio clips never do.
      if (!isVisual) continue;
      if (clip.mediaType === "audio") continue;

      if (clip.mediaType === "text") {
        if (!clip.textStyle) continue;
        emitMedia({
          kind: "text",
          clip,
          clipId: clip.id,
          trackIndex: track.index,
          blendMode: resolveBlendMode(clip.blendMode),
          opacity,
          assetId: undefined,
          transform: clip.transform,
          parentMatrix,
          precomposeGroupId,
          borderRadius: clip.borderRadius,
          effects: clip.effects,
          trackEffects: track.effects,
          textStyle: clip.textStyle,
          shapeMask: clip.mask,
          transition
        });
        continue;
      }

      if (clip.mediaType === "shape") {
        if (!clip.shapeStyle) continue;
        emitMedia({
          kind: "shape",
          clip,
          clipId: clip.id,
          trackIndex: track.index,
          blendMode: resolveBlendMode(clip.blendMode),
          opacity,
          assetId: undefined,
          transform: clip.transform,
          parentMatrix,
          precomposeGroupId,
          borderRadius: clip.borderRadius,
          effects: clip.effects,
          trackEffects: track.effects,
          shapeStyle: clip.shapeStyle,
          shapeMask: clip.mask,
          transition
        });
        continue;
      }

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
        parentMatrix,
        precomposeGroupId,
        borderRadius: clip.borderRadius,
        effects: clip.effects,
        trackEffects: track.effects,
        shapeMask: clip.mask,
        transition
      } satisfies Omit<ActiveLayer, "kind">;

      if (clip.mediaType === "image") {
        emitMedia({ kind: "image", ...common });
      } else {
        // video | overlay
        // Counted after the matte diversion, not before: a matte source never
        // draws, so charging it a decode slot pushed a visible video layer
        // over the cap — and dropping the source blanked the layer reading it.
        if (common.assetId && !matteSourceIds.has(clip.id)) {
          if (videoCount >= maxVideoLayers) {
            droppedLayers.push({
              clipId: clip.id,
              reason: "video_layer_cap"
            });
            continue;
          }
          videoCount += 1;
        }
        emitMedia({ kind: "video", ...common });
      }
    }
  }

  const drawn = attachMattes(
    mediaLayers,
    matteLayers,
    clipById,
    droppedLayers
  );

  return {
    layers: [...drawn, ...captionLayers],
    precomposites: collectPrecomposites(clips, tracks, groups, usedSurfaces),
    droppedLayers,
    nextChangeMs
  };
}

/**
 * Hand each matted layer the source layer that drives its alpha, and drop the
 * ones whose source drew nothing at this time.
 *
 * Three outcomes, and the difference between the last two is what the caller
 * can act on. The source resolved to a layer: the matte is attached. The source
 * clip is in the document but produced no layer here — outside its own window,
 * on a hidden track — so its matte is empty and the layer it drives shows
 * nothing; the layer is dropped and named. The source clip is not in the
 * document at all: the matte is ignored and the layer draws unmatted, which is
 * what `matte_source_missing` reports, the way a missing parent renders
 * unparented.
 */
function attachMattes(
  layers: readonly ActiveLayer[],
  matteLayers: ReadonlyMap<string, ActiveLayer>,
  clipById: ReadonlyMap<string, TimelineClip>,
  droppedLayers: DroppedLayer[]
): ActiveLayer[] {
  const out: ActiveLayer[] = [];
  for (const layer of layers) {
    const matte = layer.clip.matte;
    const mode = matte ? parseMatteMode(matte.mode) : null;
    if (!matte || mode === null) {
      out.push(layer);
      continue;
    }
    const source = matteLayers.get(matte.sourceClipId);
    if (source) {
      layer.matte = { mode, invert: matte.invert ?? false, layer: source };
      out.push(layer);
      continue;
    }
    if (!clipById.has(matte.sourceClipId)) {
      out.push(layer);
      continue;
    }
    droppedLayers.push({
      clipId: layer.clipId,
      reason: "matte_source_inactive"
    });
  }
  return out;
}

/**
 * The precomposite layers for the surfaces `usedSurfaces` names, innermost
 * first.
 *
 * A surface only reaches the frame through the one holding it, so a nested
 * group is pulled in even when no layer drew straight into its parent. Ordering
 * by how deep a surface sits means a host building them in array order always
 * finds a nested surface already composed — the tree has no other constraint,
 * so depth is a sufficient topological order.
 */
function collectPrecomposites(
  clips: readonly TimelineClip[],
  tracks: readonly TimelineTrack[],
  groups: ResolvedGroups,
  usedSurfaces: ReadonlySet<string>
): PrecompositeLayer[] {
  if (usedSurfaces.size === 0) return [];

  const needed = new Set<string>();
  for (const id of usedSurfaces) {
    let cursor: string | undefined = id;
    while (cursor && !needed.has(cursor)) {
      needed.add(cursor);
      cursor = groups.get(cursor)?.precomposite?.parentSurfaceId;
    }
  }

  const trackIndexById = new Map<string, number>();
  for (const track of tracks) trackIndexById.set(track.id, track.index);
  const groupClipById = new Map<string, TimelineClip>();
  for (const clip of clips) {
    if (needed.has(clip.id)) groupClipById.set(clip.id, clip);
  }

  const depthOf = (id: string): number => {
    let depth = 0;
    let cursor = groups.get(id)?.precomposite?.parentSurfaceId;
    while (cursor) {
      depth += 1;
      cursor = groups.get(cursor)?.precomposite?.parentSurfaceId;
    }
    return depth;
  };

  const out: PrecompositeLayer[] = [];
  for (const id of needed) {
    const precomposite = groups.get(id)?.precomposite;
    const clip = groupClipById.get(id);
    if (!precomposite || !clip) continue;
    out.push({
      clipId: id,
      // A group always sits on a track; falling back to the caption index
      // rather than 0 keeps a surface whose track went missing on top of the
      // picture instead of buried under it.
      trackIndex: trackIndexById.get(clip.trackId) ?? CAPTION_TRACK_INDEX,
      opacity: precomposite.opacity,
      blendMode: precomposite.blendMode,
      effects: precomposite.effects,
      precomposeGroupId: precomposite.parentSurfaceId
    });
  }
  return out.sort((a, b) => depthOf(b.clipId) - depthOf(a.clipId));
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

// ── Motion-design animation resolution ───────────────────────────────────────

/**
 * The animated transform/opacity a layer should render with at a point in time.
 * Composed from the layer's static `transform`/`opacity` and its animation
 * sample. Identical fields to the layer when it has no active animation.
 */
export interface AnimatedLayerProps {
  transform?: ClipTransform;
  opacity: number;
  /** Wipe mask to apply in the compositor. Absent means unmasked. */
  mask?: AnimationSampleMask;
  /**
   * Effects to feed the compositor's per-layer effect pre-pass: the clip's
   * static `effects` with any animated blur and grade channels composed in.
   * Equal to the clip's own `effects` when no effect animation is active.
   */
  effects?: ClipEffect[];
  /**
   * The clip's `shapeStyle` with any animated `trimStart`/`trimEnd` applied.
   * Equal to the clip's own when neither is driven. The shape rasterizer does
   * not read the trim range yet, so today this is carried, not drawn.
   */
  shapeStyle?: TimelineClip["shapeStyle"];
}

interface CompileCacheEntry {
  /** The `animations` array reference this entry was compiled from. */
  animationsRef: ClipAnimation[];
  /** Recompile when the clip is trimmed (window math depends on duration). */
  durationMs: number;
  canvasW: number;
  canvasH: number;
  /** The unit the clip's staggers were counted in. */
  staggerUnit: StaggerUnit;
  /** Unit count of a text clip (stagger span math depends on it). 0 otherwise. */
  staggerCount: number;
  compiled: CompiledAnimation[];
}

/**
 * Per-clip memoized compilation so the rAF loop never compiles. Invalidated
 * when the clip's `animations` array reference, its duration, or the canvas
 * size changes. Keyed by clip id.
 */
export type AnimationCompileCache = Map<string, CompileCacheEntry>;

export function createAnimationCompileCache(): AnimationCompileCache {
  return new Map();
}

/**
 * The unit a clip's staggered animations are timed and drawn in, and how many
 * of it the clip's text holds. A clip lays out in ONE unit — the rasterizer
 * walks a single list — so the first enabled animation naming a unit this
 * build knows decides it, and the compiler drops a stagger declaring another.
 *
 * Non-text clips and clips with no stagger count zero, which is how a stagger
 * config stays a no-op outside text.
 */
export function clipStaggerCount(
  clip: TimelineClip,
  canvas: RenderCanvas
): { unit: StaggerUnit; count: number } {
  const none = { unit: "word" as StaggerUnit, count: 0 };
  if (clip.mediaType !== "text" || !clip.textStyle) return none;
  for (const animation of clip.animations ?? []) {
    if (animation.enabled === false || !animation.stagger) continue;
    const unit = parseStaggerUnit(animation.stagger.unit);
    if (!unit) continue;
    return { unit, count: countTextStaggerUnits(clip.textStyle, canvas, unit) };
  }
  return none;
}

function compiledFor(
  clip: TimelineClip,
  canvas: RenderCanvas,
  cache?: AnimationCompileCache
): CompiledAnimation[] {
  const animations = clip.animations;
  if (!animations || animations.length === 0) return [];
  const { unit: staggerUnit, count: staggerCount } = clipStaggerCount(
    clip,
    canvas
  );
  if (cache) {
    const hit = cache.get(clip.id);
    if (
      hit &&
      hit.animationsRef === animations &&
      hit.durationMs === clip.durationMs &&
      hit.canvasW === canvas.width &&
      hit.canvasH === canvas.height &&
      hit.staggerUnit === staggerUnit &&
      hit.staggerCount === staggerCount
    ) {
      return hit.compiled;
    }
    const compiled = compileClipAnimations(animations, clip.durationMs, canvas, {
      staggerCount,
      staggerUnit
    });
    cache.set(clip.id, {
      animationsRef: animations,
      durationMs: clip.durationMs,
      canvasW: canvas.width,
      canvasH: canvas.height,
      staggerUnit,
      staggerCount,
      compiled
    });
    return compiled;
  }
  return compileClipAnimations(animations, clip.durationMs, canvas, {
    staggerCount,
    staggerUnit
  });
}

const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

/**
 * Compose a layer's static transform/opacity with its animation sample at
 * `currentTimeMs`. Returns the layer's existing values (no allocation) when the
 * clip has no enabled animations or the sample is identity at this time.
 *
 * `sample.opacity` multiplies the already-resolved layer opacity (base ×
 * crossfade), so animations compose with `transitionIn` rather than fight it.
 */
export function resolveAnimatedLayerProps(
  layer: { clip: TimelineClip; transform?: ClipTransform; opacity: number },
  currentTimeMs: number,
  canvas: RenderCanvas,
  cache?: AnimationCompileCache
): AnimatedLayerProps {
  const clip = layer.clip;
  const compiled = compiledFor(clip, canvas, cache);
  if (compiled.length === 0) {
    return staticProps(layer);
  }

  const s = sampleAnimations(compiled, currentTimeMs - clip.startMs);
  if (isIdentitySample(s)) {
    return staticProps(layer);
  }

  const base = layer.transform ?? IDENTITY_TRANSFORM;
  // `positionX/Y` and `anchorX/Y` replace the clip's own value when driven;
  // `offsetX/Y` still add on top, so an offset animation composes with a
  // position one instead of fighting it.
  const transform: ClipTransform = {
    position: {
      x: (s.positionX ?? base.position.x) + s.offsetX,
      y: (s.positionY ?? base.position.y) + s.offsetY
    },
    scale: {
      x: base.scale.x * s.scale * s.scaleX,
      y: base.scale.y * s.scale * s.scaleY
    },
    rotation: base.rotation + s.rotation,
    anchor:
      s.anchorX === undefined && s.anchorY === undefined
        ? base.anchor
        : { x: s.anchorX ?? base.anchor.x, y: s.anchorY ?? base.anchor.y }
  };
  // `s.mask` is freshly allocated per sampleAnimations call here (no scratch
  // is passed), so handing it out is safe.
  return {
    transform,
    opacity: layer.opacity * s.opacity,
    mask: s.mask,
    effects: composeAnimatedEffects(clip.effects, s),
    shapeStyle: composeAnimatedShapeStyle(clip.shapeStyle, s)
  };
}

/** The layer's own values, for a clip with no animation in flight. */
function staticProps(layer: {
  clip: TimelineClip;
  transform?: ClipTransform;
  opacity: number;
}): AnimatedLayerProps {
  return {
    transform: layer.transform,
    opacity: layer.opacity,
    effects: layer.clip.effects,
    shapeStyle: layer.clip.shapeStyle
  };
}

/**
 * Fold the sampled effect values into the clip's static effects for the
 * compositor pre-pass. The animated blur and the grade's additive terms ADD to
 * the aggregated values and its multipliers MULTIPLY — the same aggregation
 * `effectsProcessor` / `canvas2d` `computeFilterForEffects` apply across
 * effects — so a synthesized blur effect and a synthesized color effect
 * appended to the static list land on exactly those rules. Returns the static
 * array unchanged when the sampled values are identity (no allocation on the
 * steady path).
 */
function composeAnimatedEffects(
  staticEffects: ClipEffect[] | undefined,
  s: AnimationSample
): ClipEffect[] | undefined {
  const hasColor =
    s.brightness !== 0 ||
    s.saturation !== 1 ||
    s.contrast !== 1 ||
    s.hue !== 0 ||
    s.temperature !== 0 ||
    s.tint !== 0;
  const hasBlur = s.blur > 0;
  if (!hasColor && !hasBlur) return staticEffects;
  const out: ClipEffect[] = staticEffects ? [...staticEffects] : [];
  if (hasColor) {
    out.push({
      id: "anim-color",
      type: "color",
      enabled: true,
      brightness: s.brightness,
      saturation: s.saturation,
      contrast: s.contrast,
      hue: s.hue,
      temperature: s.temperature,
      tint: s.tint
    });
  }
  if (hasBlur) {
    out.push({ id: "anim-blur", type: "blur", enabled: true, radius: s.blur });
  }
  return out;
}

/**
 * Apply the sampled trim range to the clip's shape style. Both channels
 * replace rather than compose, so an undriven one leaves the clip's own value
 * in place; an unanimated clip keeps its own object.
 */
function composeAnimatedShapeStyle(
  staticStyle: TimelineClip["shapeStyle"],
  s: AnimationSample
): TimelineClip["shapeStyle"] {
  if (!staticStyle) return staticStyle;
  if (s.trimStart === undefined && s.trimEnd === undefined) return staticStyle;
  return {
    ...staticStyle,
    trimStart: s.trimStart ?? staticStyle.trimStart,
    trimEnd: s.trimEnd ?? staticStyle.trimEnd
  };
}

/**
 * Resolve the stagger context for a text layer at `currentTimeMs`, or `null`
 * when the clip has no staggered animation. Shared by the live preview, the
 * export renderer, and the agent frame harness so per-word motion is drawn
 * from one code path (preview == export).
 */
export function resolveTextStaggerContext(
  clip: TimelineClip,
  currentTimeMs: number,
  canvas: RenderCanvas,
  cache?: AnimationCompileCache
): TextRenderStagger | null {
  if (clip.mediaType !== "text") return null;
  const compiled = compiledFor(clip, canvas, cache);
  if (compiled.length === 0 || !hasStaggeredAnimation(compiled)) return null;
  return { compiled, localMs: currentTimeMs - clip.startMs };
}

/**
 * True when any active layer has an animation whose window covers
 * `currentTimeMs`. The live preview uses this to keep redrawing every rAF tick
 * while motion is in flight, even though the cached layer *set* is unchanged.
 */
export function hasActiveAnimation(
  layers: ActiveLayer[],
  currentTimeMs: number,
  canvas: RenderCanvas,
  cache?: AnimationCompileCache
): boolean {
  for (const layer of layers) {
    const clip = layer.clip;
    if (!clip.animations || clip.animations.length === 0) continue;
    const compiled = compiledFor(clip, canvas, cache);
    if (hasActiveAnimationWindow(compiled, currentTimeMs - clip.startMs)) {
      return true;
    }
  }
  return false;
}

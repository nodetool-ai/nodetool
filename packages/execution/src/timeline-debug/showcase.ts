import { isRecord } from "@nodetool-ai/protocol";
import type {
  ClipEffect,
  ClipShapeStyle,
  ClipTransform,
  TimelineClip,
  TimelineDocument
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  compileClipAnimations,
  isKnownShapeKind,
  parseClipEffectType,
  resolveBeatAnimations
} from "@nodetool-ai/timeline";
import {
  buildShapeSegments,
  flattenSegments,
  resolveClipLayoutsWithDiagnostics,
  trimFlatPath
} from "@nodetool-ai/timeline/scene";
import {
  ancestorChain,
  type Box,
  composedMatrix,
  containsBox,
  frameBoxFor,
  hasPerspectiveAncestor,
  isBackgroundBed,
  projectPoint
} from "./frame-geometry.js";
import type { TimelineDebugIssue } from "./types.js";

type Window = { start: number; end: number };
const MIN_LAYERS = 3;
const MIN_COVERAGE = 0.8;
// Shipped showcases (excluding t-minus-30), measured from their visible spans —
// re-measured from `packages/execution/tests/timeline-showcase.test.ts`'s own
// "measures the medians used in the validator derivation" test, which computes
// these straight from the shipped files; re-run it and update both this
// comment and the two constants below together whenever an example changes
// its groups/animations/effects/clip count, so this file and that test never
// silently disagree about what "the shipped examples" measure to.
// cadence: 29 groups, 106000/17767 custom/s, 6 effect types, 163000/17767 clips/s
// kite: 32, 95/15, 6, 149/15; prism: 22, 57000/18467, 10, 95000/18467
// serein: 145, 172/26, 7, 764/26; tidewater: 23, 41000/15958, 6, 181000/15958
// voltra: 16, 125000/22735, 14, 130000/22735.
// Medians (the upper one of six): 29 groups, 106000/17767 custom/s, 7 effects, 149/15 clips/s.
// A median floor would reject shipped examples. Use their lower envelope for
// warnings, report the median target, and require rendered example comparison.
export const SHOWCASE_FLOOR = {
  groups: 16,
  customPerSecond: 41000 / 15958,
  effects: 6,
  clipsPerSecond: 95000 / 18467
};
export const SHOWCASE_TARGET = {
  groups: 29,
  customPerSecond: 106000 / 17767,
  effects: 7,
  clipsPerSecond: 149 / 15
};
// Segment-average speed, normalized to canvas dimensions. Sharp cuts can
// intentionally exceed this proxy, so the skill requires a visual justification.
const FAST_POSITION_PER_SECOND = 20;
const FAST_SCALE_PER_SECOND = 20;
const FINISH_EFFECT_TYPES = [
  "grain",
  "vignette",
  "color",
  "curves",
  "levels",
  "liftGammaGain",
  "lut"
];

/** Static eligibility only. Assets, occlusion, sampled opacity and aesthetics need rendered review. */
function hasVisualContent(clip: TimelineClip): boolean {
  if (clip.mediaType === "text") {
    return Boolean(clip.textStyle?.text.trim());
  }
  if (clip.mediaType === "shape") {
    return Boolean(clip.shapeStyle && isKnownShapeKind(clip.shapeStyle.kind));
  }
  return (
    ["image", "video", "overlay", "model3d"].includes(clip.mediaType) &&
    Boolean(clip.currentAssetId)
  );
}

/** Memoized parent windows: iterative, linear even for deeply nested scenes. */
function activeWindows(doc: TimelineDocument): Map<string, Window | null> {
  const clips = new Map(doc.clips.map((clip) => [clip.id, clip]));
  const tracks = new Map(doc.tracks.map((track) => [track.id, track]));
  const windows = new Map<string, Window | null>();
  for (const clip of doc.clips) {
    if (windows.has(clip.id)) {
      continue;
    }
    const chain: TimelineClip[] = [];
    const seen = new Set<string>();
    let current: TimelineClip | undefined = clip;
    let parentWindow: Window | null | undefined;
    while (current && !windows.has(current.id)) {
      if (seen.has(current.id)) {
        parentWindow = null;
        break;
      }
      seen.add(current.id);
      chain.push(current);
      const parent: TimelineClip | undefined = current.parentId
        ? clips.get(current.parentId)
        : undefined;
      current = parent?.mediaType === "group" ? parent : undefined;
    }
    if (current && windows.has(current.id)) {
      parentWindow = windows.get(current.id);
    }
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const entry = chain[i];
      if (!entry) {
        continue;
      }
      const track = tracks.get(entry.trackId);
      const scale = entry.transform?.scale;
      const active =
        parentWindow !== null &&
        track?.visible &&
        (track.type === "video" || track.type === "overlay") &&
        !entry.hidden &&
        (entry.opacity ?? 1) > 0 &&
        scale?.x !== 0 &&
        scale?.y !== 0;
      const start = Math.max(0, entry.startMs, parentWindow?.start ?? 0);
      const end = Math.min(
        entry.startMs + entry.durationMs,
        parentWindow?.end ?? Infinity
      );
      parentWindow = active && end > start ? { start, end } : null;
      windows.set(entry.id, parentWindow);
    }
  }
  return windows;
}

function hasFinish(effect: ClipEffect): boolean {
  if (!effect.enabled) {
    return false;
  }
  if (effect.type === "grain" || effect.type === "vignette") {
    return typeof effect.amount === "number" && effect.amount > 0;
  }
  if (effect.type === "lut") {
    return (
      effect.intensity !== 0 &&
      typeof effect.cube === "string" &&
      effect.cube.length > 0
    );
  }
  if (effect.type === "color") {
    return Object.entries(effect).some(
      ([key, value]) =>
        !["id", "type", "enabled"].includes(key) &&
        typeof value === "number" &&
        value !== (["contrast", "saturation"].includes(key) ? 1 : 0)
    );
  }
  if (effect.type === "curves") {
    return [effect.master, effect.r, effect.g, effect.b].some(
      (points) =>
        Array.isArray(points) &&
        points.some(
          (point: unknown) =>
            typeof point === "object" &&
            point !== null &&
            "x" in point &&
            "y" in point &&
            point.x !== point.y
        )
    );
  }
  if (effect.type === "levels") {
    return (
      effect.inBlack !== 0 ||
      effect.inWhite !== 1 ||
      effect.gamma !== 1 ||
      effect.outBlack !== 0 ||
      effect.outWhite !== 1
    );
  }
  if (effect.type === "liftGammaGain") {
    return [effect.lift, effect.gamma, effect.gain].some(
      (values, i) =>
        Array.isArray(values) &&
        values.some((value: unknown) => value !== (i === 0 ? 0 : 1))
    );
  }
  return false;
}

/** Three independent visual clips for 80% of the first-to-last visible span, including gaps. O(n log n). */
function layerCoverage(windows: readonly Window[]): number {
  if (windows.length === 0) {
    return 0;
  }
  const events = windows.flatMap((window) => [
    { time: window.start, delta: 1 },
    { time: window.end, delta: -1 }
  ]);
  events.sort((a, b) => a.time - b.time);
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last || last.time <= first.time) {
    return 0;
  }
  let count = 0;
  let covered = 0;
  let previous = first.time;
  for (const event of events) {
    if (count >= MIN_LAYERS) {
      covered += event.time - previous;
    }
    count += event.delta;
    previous = event.time;
  }
  return covered / (last.time - first.time);
}

// ── Craft checks: frame coverage, text collision, motion range, dead motion ──
//
// Static geometry only, same rule as `hasVisualContent`: no rendered pixels,
// no sampled animation curves, no occlusion. A box is the clip's own authored
// transform projected into frame pixels — the scene model's placement math
// (`buildTransformMatrix`, `layoutTextBlock`), not a second implementation of
// it — composed through every ancestor group's transform in one matrix, the
// way `parentMatrix` composes it for a real render.

/**
 * Any shape's stroked outline as chords in frame pixels — rect, ellipse,
 * polygon, star and an authored `path` all resolve through the one geometry
 * builder every render surface draws through (`buildShapeSegments`), flattened
 * to a polyline (`flattenSegments`) so a curve's chords track it closely. Used
 * to test whether the *stroke itself* crosses a box, not just its bounding
 * rectangle — a ring's bbox looks solid but its ink is a thin ring around an
 * empty middle, and a ray's bbox can cover most of the frame while the
 * 1px-wide line inside it touches almost none of that area. Respects
 * `trimStart`/`trimEnd` (the clip's own authored values — this file samples
 * statically, not an animated instant) so a partially-drawn stroke does not
 * collide along the portion it never draws.
 */
function shapeStrokeChordsInFrame(
  clip: TimelineClip,
  shape: ClipShapeStyle,
  canvas: { width: number; height: number },
  byId: ReadonlyMap<string, TimelineClip>,
  resolved: ReadonlyMap<string, ClipTransform>,
  sizes?: ReadonlyMap<string, { width: number; height: number }>
): Array<[Point, Point]> | undefined {
  // A flex-managed shape's stroke has to be built at its *resolved* size,
  // not its authored `width`/`height` (see `localBox` in `frame-geometry.ts`
  // for the same gap on a filled plate) — a ring or an outlined pill
  // stretched to fill a flex slot draws its outline at that stretched size.
  // `sizes` gives only the size, pinned to the top-left the same way a
  // resized plate's local box is: `clip`'s *position* still comes from the
  // ordinary `resolved`/`composedMatrix` path below, flex-resized or not, so
  // this shape gets the one position/rotation/scale composition every other
  // clip goes through rather than a second, absolute-box-shaped one.
  const size = sizes?.get(clip.id);
  const effectiveShape = size
    ? { ...shape, x: 0, y: 0, width: size.width / canvas.width, height: size.height / canvas.height }
    : shape;
  const segments = buildShapeSegments(effectiveShape, canvas.width, canvas.height);
  if (!segments) {
    return undefined;
  }
  const flat = flattenSegments(segments);
  const trimStart = shape.trimStart ?? 0;
  const trimEnd = shape.trimEnd ?? 1;
  const runs = trimStart > 0 || trimEnd < 1 ? trimFlatPath(flat, trimStart, trimEnd) : flat.map((sub) => sub.points);
  const matrix = composedMatrix(clip, canvas, byId, resolved);
  const chords: Array<[Point, Point]> = [];
  for (const points of runs) {
    const projected = points.map((p) => projectPoint(p.x, p.y, matrix, canvas));
    for (let i = 1; i < projected.length; i += 1) {
      chords.push([projected[i - 1]!, projected[i]!]);
    }
  }
  return chords;
}

function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

type Point = { x: number; y: number };

function pointInBox(p: Point, box: Box): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Proper (strict) segment-segment crossing. Touching/collinear endpoints
 * are not reported as a crossing — a stroke ending exactly on a box edge is
 * not the "cuts through" case this proxy is built to catch, and treating it
 * as one would false-positive on every hairline-tolerance coincidence. */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Whether the stroke `p1..p2`, inflated by half its width, reaches `box` —
 * a real proximity test against the line itself, not its bounding box. */
function segmentIntersectsBox(p1: Point, p2: Point, box: Box, inflatePx: number): boolean {
  const inflated: Box = {
    x: box.x - inflatePx,
    y: box.y - inflatePx,
    width: box.width + 2 * inflatePx,
    height: box.height + 2 * inflatePx
  };
  if (pointInBox(p1, inflated) || pointInBox(p2, inflated)) {
    return true;
  }
  const corners: Point[] = [
    { x: inflated.x, y: inflated.y },
    { x: inflated.x + inflated.width, y: inflated.y },
    { x: inflated.x + inflated.width, y: inflated.y + inflated.height },
    { x: inflated.x, y: inflated.y + inflated.height }
  ];
  for (let i = 0; i < 4; i += 1) {
    if (segmentsCross(p1, p2, corners[i]!, corners[(i + 1) % 4]!)) {
      return true;
    }
  }
  return false;
}

function clipToCanvas(box: Box, canvas: { width: number; height: number }): Box {
  const x0 = Math.max(0, box.x);
  const y0 = Math.max(0, box.y);
  const x1 = Math.min(canvas.width, box.x + box.width);
  const y1 = Math.min(canvas.height, box.y + box.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Exact union area of axis-aligned boxes by coordinate-compression grid.
 * Scene-scale inputs (tens of boxes), so the O(n²) grid is cheap. */
function unionArea(boxes: readonly Box[], canvas: { width: number; height: number }): number {
  const clipped = boxes.map((box) => clipToCanvas(box, canvas)).filter((box) => box.width > 0 && box.height > 0);
  if (clipped.length === 0) {
    return 0;
  }
  const xs = Array.from(new Set(clipped.flatMap((box) => [box.x, box.x + box.width]))).sort((a, b) => a - b);
  const ys = Array.from(new Set(clipped.flatMap((box) => [box.y, box.y + box.height]))).sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (clipped.some((box) => cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height)) {
        area += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
      }
    }
  }
  return area;
}

function childrenByParentMap(doc: TimelineDocument): Map<string, TimelineClip[]> {
  const children = new Map<string, TimelineClip[]>();
  for (const clip of doc.clips) {
    if (!clip.parentId) {
      continue;
    }
    const siblings = children.get(clip.parentId) ?? [];
    siblings.push(clip);
    children.set(clip.parentId, siblings);
  }
  return children;
}

function descendantClips(sceneId: string, children: ReadonlyMap<string, TimelineClip[]>): TimelineClip[] {
  const result: TimelineClip[] = [];
  const stack = [...(children.get(sceneId) ?? [])];
  while (stack.length > 0) {
    const clip = stack.pop()!;
    result.push(clip);
    if (clip.mediaType === "group") {
      stack.push(...(children.get(clip.id) ?? []));
    }
  }
  return result;
}

// Measured on every shipped scene, at five sample points (10/30/50/70/90% of
// each scene's visible span; kite, prism, serein, tidewater, voltra —
// t-minus-30 excluded, as above): coverage ranges from serein's S4a
// ("Security" panel, a deliberately minimal beat) at 4.2% up past 80%. The
// floor sits with margin under that lowest legitimate beat.
//
// This still leaves the check weak against the pattern the agent fixture
// shows. Its own six scenes measure 7.1%-17.3% — every one of them *above*
// this floor and inside the range legitimate scenes occupy, so nothing here
// fires on it, even though every rendered frame is a small ring on an
// otherwise empty field. The reason: AABB union coverage cannot see ink
// density. A thin ring's *bounding box* is the same size a chunky filled
// shape covering the same span would have; the metric has no way to tell
// "a shape fills this region" from "a hairline outline passes through this
// region leaving most of it empty." A pixel-sampling or stroke-area-aware
// metric would separate them; this one does not. Flagged rather than forced
// — a floor cannot fix a metric that is measuring the wrong thing.
const FRAME_COVERAGE_FLOOR = 0.03;

/** Frame content is a ~300px ring in a 1920x1080 field: dense structure,
 * near-empty frame. Union AABB coverage of visible non-background layers,
 * sampled through each scene, catches it without a pixel render. */
function checkFrameUnderfilled(
  doc: TimelineDocument,
  canvas: { width: number; height: number },
  windows: ReadonlyMap<string, Window | null>,
  byId: ReadonlyMap<string, TimelineClip>,
  children: ReadonlyMap<string, TimelineClip[]>,
  resolved: ReadonlyMap<string, ClipTransform>,
  sizes: ReadonlyMap<string, { width: number; height: number }>
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const scenes = doc.clips.filter((clip) => clip.mediaType === "group" && !clip.parentId);
  for (const scene of scenes) {
    const sceneWindow = windows.get(scene.id);
    if (!sceneWindow) {
      continue;
    }
    // Unlike text_collision, a perspective-tilted clip is not excluded here:
    // a projective AABB is unsound for a *precise* box, but coverage only
    // asks "roughly how much of the frame has content on it", and an
    // untilted footprint is a closer read of that than the real (tilted) one
    // — excluding it entirely is worse either way: a whole tilted card
    // (kite's S4 chart, 29 clips under one `rotationX`/`perspective` group)
    // then reads as an empty frame with two small text stacks floating in
    // it. (A suspected cache-key collision in `buildTransformMatrix` — two
    // parent matrices differing only by tilt hashing to the same key —
    // turned out not to reproduce once tested directly against a
    // cache-bypassing reference; see packages/timeline
    // `tests/render.transform.test.ts`. `affineKey` samples exactly the
    // entries a tilt varies.)
    const content = descendantClips(scene.id, children).filter(
      (clip) => hasVisualContent(clip) && windows.get(clip.id)
    );
    if (content.length === 0) {
      continue;
    }
    let best = 0;
    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const t = sceneWindow.start + frac * (sceneWindow.end - sceneWindow.start);
      const boxes: Box[] = [];
      for (const clip of content) {
        const window = windows.get(clip.id)!;
        if (t < window.start || t >= window.end) {
          continue;
        }
        const box = frameBoxFor(clip, canvas, byId, resolved, undefined, true, sizes);
        if (!box || box.width <= 0 || box.height <= 0 || isBackgroundBed(box, canvas)) {
          continue;
        }
        boxes.push(box);
      }
      best = Math.max(best, unionArea(boxes, canvas) / (canvas.width * canvas.height));
    }
    if (best < FRAME_COVERAGE_FLOOR) {
      issues.push({
        severity: "warning",
        code: "showcase_frame_underfilled",
        clipId: scene.id,
        message: `Frame is underfilled: "${scene.name || scene.id}"'s visible content covers at most ${(best * 100).toFixed(1)}% of the frame at its sampled instants, under the ${(FRAME_COVERAGE_FLOOR * 100).toFixed(0)}% floor. See kite: bed, midground and foreground fill the field, not a single centred mark. Add supporting geometry, type or a bed that reaches the frame edges.`
      });
    }
  }
  return issues;
}

/** A shape with a stroke and no fill has ink only along its outline — of any
 * kind, including a hand-drawn `path` ring. This must stay independent of
 * `kind`: gating it to "ellipse"/"rect" made every unfilled `path` ring (the
 * shape the real ring-crosses-text defect uses) read as "filled" by omission
 * and fall into the opaque-backdrop z-order skip below, so a stroke-only ring
 * drawn behind text never got checked at all. */
function isUnfilled(style: ClipShapeStyle): boolean {
  if (!style.stroke || !((style.strokeWidthPx ?? 0) > 0)) {
    return false;
  }
  if (style.fillStyle) {
    return false;
  }
  const fill = typeof style.fill === "string" ? style.fill : undefined;
  return fill === undefined || fill === "transparent" || fill === "none";
}

/**
 * `layoutTextBlock`'s box is the full line-height leading, not the glyphs'
 * ink — a title and a label stacked with a deliberately tight gap (a common,
 * legitimate motion-design pattern) then read as colliding even though no
 * pixel touches. Shrinking a text box toward its true vertical ink extent
 * before comparing it to *another text clip* keeps the leading out of the
 * comparison; a shape's box is real geometry already and is left alone.
 *
 * The retained fraction depends on case: mixed case adds ascenders above and
 * descenders below its cap line; all-caps has no descenders but, at a bold
 * weight and large size, its cap height alone already reaches ~0.72em of a
 * 1.2em line box (see "HALO", 190px/800-weight — its rendered glyphs reach
 * close to the line box edge). Calibrated against two failure directions at
 * once: too low under-shrinks all-caps and misses a real crossing (that
 * "HALO" against "Find your focus." below it); too high over-shrinks mixed
 * case and flags tightly leaded captions that never touch in a render (kite
 * "Every purchase" / "rounds up to savings.", tidewater "Three warm nights"
 * / "of jazz on the pier.").
 */
const ALL_CAPS_INK_HEIGHT_FRAC = 0.72;
const MIXED_CASE_INK_HEIGHT_FRAC = 0.7;
function textInkBox(box: Box, text: string): Box {
  const frac = /[a-z]/.test(text) ? MIXED_CASE_INK_HEIGHT_FRAC : ALL_CAPS_INK_HEIGHT_FRAC;
  const shrink = (box.height * (1 - frac)) / 2;
  return { x: box.x, y: box.y + shrink, width: box.width, height: box.height - 2 * shrink };
}

/** How far an enabled `dropShadow` effect can visually extend a clip's hard
 * footprint — its offset, not its blur radius. Blur is soft, falling light
 * whose edge is nowhere near opaque; treating it as a hard extension of the
 * shape false-positived on pairs a rendered frame shows clear (t314/t316,
 * t342). A glow is soft over its whole radius the same way and contributes
 * nothing here for the same reason. The offset is the one part of a drop
 * shadow that is a real, solid-ish silhouette repeated a fixed distance
 * away — see "HALO"'s shadow (`offsetY: 10`) reaching toward the tagline
 * below it. */
function effectExpansionPx(clip: TimelineClip): number {
  let expand = 0;
  for (const effect of clip.effects ?? []) {
    if (!effect.enabled) {
      continue;
    }
    // `ClipEffect` is a union of a discriminated known shape and a loose
    // forward-compat one (I2), so `effect.type === "dropShadow"` alone does
    // not narrow the field types — `isRecord` reads them with evidence
    // instead of an assertion.
    if (effect.type === "dropShadow" && isRecord(effect)) {
      const offsetX = typeof effect.offsetX === "number" ? effect.offsetX : 0;
      const offsetY = typeof effect.offsetY === "number" ? effect.offsetY : 0;
      expand = Math.max(expand, Math.abs(offsetX) + Math.abs(offsetY));
    }
  }
  return expand;
}

function inflateBox(box: Box, px: number): Box {
  if (px <= 0) {
    return box;
  }
  return { x: box.x - px, y: box.y - px, width: box.width + 2 * px, height: box.height + 2 * px };
}

/** Set at or past this fraction of the frame height, a text clip is display
 * typography — a giant background numeral or wordmark other content is meant
 * to sit over or inside, not a caption competing for its own clear space. */
const DECORATIVE_TEXT_HEIGHT_FRAC = 0.4;
function isDecorativeText(clip: TimelineClip, canvas: { width: number; height: number }): boolean {
  return (clip.textStyle?.fontSizePx ?? 0) >= DECORATIVE_TEXT_HEIGHT_FRAC * canvas.height;
}

/** A hard cut's brief crossfade — two clips at the same spot for the seam,
 * one fading out under the other's fade-in — is not two pieces of content
 * competing for the frame. Below this, an overlap is presumed to be a seam. */
const TEXT_COLLISION_MIN_OVERLAP_MS = 450;

/** A small accent — a superscript badge, a corner mark — tucked inside a much
 * bigger headline's own bounding box sits in the headline's whitespace, not
 * across its ink. Only a comparably sized element is treated as competing
 * for the same space. */
const NESTED_ACCENT_AREA_FRAC = 0.25;

/** A text clip at or above this fraction of the frame height is set with
 * glyph strokes thick enough to fully hide a thin background stroke wherever
 * they overlap — see the "behind LARGE text" exemption above. The real
 * fixture's "INTRODUCING" kicker sits at 26px on a 1080px frame (2.4%); the
 * shipped "PRISM" wordmark this exemption is calibrated against sits at
 * 300px (27.8%). The floor has wide margin either side of that gap. */
const OCCLUDING_TEXT_HEIGHT_FRAC = 0.05;

/** Below this, an overlap is a graze from box estimation slack — leading a
 * layout-estimate width does not claim — rather than ink actually crossing. */
const COLLISION_MIN_OVERLAP_FRAC = 0.2;

/** A text clip's box crossing a shape's stroke, sitting under an unrelated
 * shape or text, or clipped by an unfilled ring — the collisions a frame
 * preview shows and a structural check used to leave unsaid. */
function checkTextCollision(
  doc: TimelineDocument,
  canvas: { width: number; height: number },
  windows: ReadonlyMap<string, Window | null>,
  byId: ReadonlyMap<string, TimelineClip>,
  resolved: ReadonlyMap<string, ClipTransform>,
  sizes: ReadonlyMap<string, { width: number; height: number }>
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  // Track z is `1000 - index` (I9): a higher index draws underneath. A filled
  // shape drawn behind an opaque text clip is a backdrop the text is fully
  // legible over, not a collision — the same z rule `legibility.ts` reads for
  // a backing plate.
  const trackIndex = new Map(
    doc.tracks.filter((track) => track.type !== "audio" && track.visible).map((track) => [track.id, track.index])
  );
  const texts = doc.clips.filter(
    (clip) =>
      clip.mediaType === "text" &&
      hasVisualContent(clip) &&
      windows.get(clip.id) &&
      !isDecorativeText(clip, canvas) &&
      !hasPerspectiveAncestor(clip, byId)
  );
  const shapesAndText = doc.clips.filter(
    (clip) =>
      (clip.mediaType === "shape" || clip.mediaType === "text") &&
      hasVisualContent(clip) &&
      windows.get(clip.id) &&
      !(clip.mediaType === "text" && isDecorativeText(clip, canvas)) &&
      !hasPerspectiveAncestor(clip, byId)
  );
  for (const text of texts) {
    const textWindow = windows.get(text.id)!;
    const rawTextBox = frameBoxFor(text, canvas, byId, resolved, undefined, false, sizes);
    if (!rawTextBox) {
      continue;
    }
    const textBox = inflateBox(textInkBox(rawTextBox, text.textStyle?.text ?? ""), effectExpansionPx(text));
    for (const other of shapesAndText) {
      if (other.id === text.id) {
        continue;
      }
      const otherWindow = windows.get(other.id)!;
      const overlapMs = Math.min(otherWindow.end, textWindow.end) - Math.max(otherWindow.start, textWindow.start);
      if (overlapMs < TEXT_COLLISION_MIN_OVERLAP_MS) {
        continue;
      }
      if (other.parentId === text.id || text.parentId === other.id) {
        continue;
      }
      // The same words set twice, a few pixels apart, at the same time is a
      // duotone/chromatic-split pass — one echo layer over another, not two
      // pieces of content sharing the frame.
      if (other.mediaType === "text" && other.textStyle?.text === text.textStyle?.text) {
        continue;
      }
      const rawOtherBox = frameBoxFor(other, canvas, byId, resolved, undefined, false, sizes);
      if (!rawOtherBox || isBackgroundBed(rawOtherBox, canvas)) {
        continue;
      }
      const otherBox = inflateBox(
        other.mediaType === "text" ? textInkBox(rawOtherBox, other.textStyle?.text ?? "") : rawOtherBox,
        effectExpansionPx(other)
      );
      const textArea = textBox.width * textBox.height;
      const otherArea = otherBox.width * otherBox.height;
      const minArea = Math.min(textArea, otherArea);
      // A sliver graze — two rows in a tightly leaded list a hair too close —
      // is not the same finding as one box crossing deep into another. Only
      // an overlap that eats a real share of the smaller box reads as a
      // collision a frame preview would actually show.
      if (minArea <= 0 || intersectionArea(textBox, otherBox) / minArea < COLLISION_MIN_OVERLAP_FRAC) {
        continue;
      }
      if (
        (containsBox(textBox, otherBox) && otherArea < NESTED_ACCENT_AREA_FRAC * textArea) ||
        (containsBox(otherBox, textBox) && textArea < NESTED_ACCENT_AREA_FRAC * otherArea)
      ) {
        continue;
      }
      if (other.mediaType === "shape" && other.shapeStyle) {
        const unfilled = isUnfilled(other.shapeStyle);
        const textIdx = trackIndex.get(text.trackId);
        const otherIdx = trackIndex.get(other.trackId);
        // z, `1000-index`: a higher index draws underneath.
        const behindText = textIdx !== undefined && otherIdx !== undefined && otherIdx > textIdx;
        if (!unfilled) {
          // A solid plate that fully contains the text is a background the
          // text sits on, not a collision.
          if (containsBox(otherBox, textBox)) {
            continue;
          }
          // A filled shape drawn behind the text is a backdrop the opaque
          // text renders over — fully legible regardless of overlap, at any
          // text size.
          if (behindText) {
            continue;
          }
        } else if (behindText && (text.textStyle?.fontSizePx ?? 0) >= OCCLUDING_TEXT_HEIGHT_FRAC * canvas.height) {
          // An unfilled stroke behind LARGE text (a sunburst ray, a stack of
          // concentric rings behind a display wordmark) reads as fully
          // hidden wherever it overlaps: a big glyph's own stroke width is
          // wide enough to cover a thin background line. A SMALL caption's
          // glyph strokes are thin enough that the same background stroke
          // can show through the gaps between letters — see the real defect
          // this file was written for: a 26px kicker with a ring behind it.
          continue;
        } else {
          // An unfilled shape's bounding box is the wrong test regardless of
          // kind — a ring's box looks solid but is empty in the middle, a
          // ray's box spans a diagonal its 1px line barely touches. Resolve
          // its real outline (rect/ellipse/polygon/star/path all go through
          // the one geometry builder every render surface uses) and test
          // whether the stroke itself, inflated by half its width, reaches
          // the text's box. A box fully inside a ring's hole touches no
          // segment; a box straddling the curve does.
          const chords = shapeStrokeChordsInFrame(other, other.shapeStyle, canvas, byId, resolved, sizes);
          const inflate = (other.shapeStyle.strokeWidthPx ?? 2) / 2 + effectExpansionPx(other);
          if (chords && !chords.some(([a, b]) => segmentIntersectsBox(a, b, textBox, inflate))) {
            continue;
          }
        }
      }
      issues.push({
        severity: "warning",
        code: "showcase_text_collision",
        clipId: text.id,
        message: `Text collision: "${text.name || text.id}" overlaps ${other.mediaType} "${other.name || other.id}". See serein or voltra: type sits clear of the shapes around it, or on a plate sized to hold it. Move the text, resize the shape, or give the text a background plate.`
      });
    }
  }
  return issues;
}

// Measured on every shipped example: the fewest distinct animated properties
// on a scene that still passed the other showcase floors was tidewater's 5
// (secondary curves plus one style track). Floor is set with margin below it.
const MOTION_RANGE_PROPERTY_FLOOR = 3;

/** Counts distinct animated properties across custom/preset curves, style
 * tracks, text animators, staggers and authored transitions. A cut leaning on
 * one or two properties (opacity, scale) reads as thin even when it is dense. */
function checkMotionRangeNarrow(
  doc: TimelineDocument,
  canvas: { width: number; height: number },
  windows: ReadonlyMap<string, Window | null>
): TimelineDebugIssue[] {
  const properties = new Set<string>();
  let styleTrackCount = 0;
  let transitionCount = 0;
  for (const clip of doc.clips) {
    const window = windows.get(clip.id);
    if (!window) {
      continue;
    }
    const animations = resolveBeatAnimations(clip, doc.tempo);
    const animationsById = new Map((animations ?? []).map((a) => [a.id, a]));
    const compiled = compileClipAnimations(animations, clip.durationMs, canvas);
    for (const animation of compiled) {
      if (clip.startMs + animation.windowStartMs >= window.end || clip.startMs + animation.windowEndMs <= window.start) {
        continue;
      }
      for (const curve of animation.curves) {
        if (curve.keyframes.some((k) => k.value !== curve.keyframes[0]?.value)) {
          properties.add(curve.property);
        }
      }
      const source = animationsById.get(animation.id);
      for (const track of source?.styleTracks ?? []) {
        if (track.keyframes.some((k) => k.value !== track.keyframes[0]?.value)) {
          properties.add(`style:${track.target}`);
          styleTrackCount += 1;
        }
      }
      if (source?.textAnimator) {
        properties.add(`textAnimator:${source.textAnimator.kind}`);
      }
      if (source?.stagger) {
        properties.add(`stagger:${source.stagger.unit}`);
      }
    }
    if (clip.transitionIn) {
      properties.add(`transition:${clip.transitionIn.type}`);
      transitionCount += 1;
    }
  }
  const noStructure = styleTrackCount === 0 && transitionCount === 0;
  if (!noStructure && properties.size >= MOTION_RANGE_PROPERTY_FLOOR) {
    return [];
  }
  return [
    {
      severity: "warning",
      code: "showcase_motion_range_narrow",
      message: `Motion-range gap: ${properties.size} distinct animated properties (floor ${MOTION_RANGE_PROPERTY_FLOOR}), ${styleTrackCount} active style tracks, ${transitionCount} authored transitions. See tidewater: secondary curves widen the range past opacity and scale, and style tracks or an authored transition add a texture curves alone do not.`
    }
  ];
}

// A clock/countdown format (`mm:ss`, `h:mm:ss`) is unambiguous. A bare number
// or a currency/percent amount ("14", "$9.99", "18%") is not — a calendar day,
// a fixed price and a static stat are common, legitimate uses of digits that
// are correct not to animate, and flagging every one of them would drown the
// real timers and tickers in noise.
const COUNTER_TEXT = /^\d{1,2}:\d{2}(:\d{2})?$/;
const COUNTER_MIN_VISIBLE_MS = 2000;
/** A ticker that has not started by this fraction of the clip's own visible
 * span has spent most of its screen time showing the un-animated start
 * value — the count never visibly moves for the viewer. */
const TICKER_PREROLL_FLOOR = 0.5;
/** Below this, a clock-formatted string is small UI chrome — a scrubber
 * timestamp, a schedule-list row — not a hero display asking to be watched.
 * Measured on every shipped example: the largest of serein's ~90 static
 * clock labels (a scrubber list, deliberately unmoving) sets at 26px; the
 * floor sits with margin above it. */
const COUNTER_FONT_HEIGHT_FRAC = 0.05;

function looksLikeCounter(clip: TimelineClip, canvas: { width: number; height: number }): boolean {
  const style = clip.textStyle;
  if (!style || (style.fontSizePx ?? 0) < COUNTER_FONT_HEIGHT_FRAC * canvas.height) {
    return false;
  }
  const trimmed = style.text.trim();
  return trimmed.length > 0 && COUNTER_TEXT.test(trimmed);
}

function sceneIdFor(clip: TimelineClip, byId: ReadonlyMap<string, TimelineClip>): string | undefined {
  const chain = ancestorChain(clip, byId);
  const root = chain[0];
  return root && root.mediaType === "group" && !root.parentId ? root.id : undefined;
}

/** A frozen timer/counter and a ticker whose count-up window misses the
 * clip's own visible span — motion the structural checks never noticed
 * because the document still has *an* animation on the clip. */
function checkDeadMotion(
  doc: TimelineDocument,
  canvas: { width: number; height: number },
  windows: ReadonlyMap<string, Window | null>,
  byId: ReadonlyMap<string, TimelineClip>
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const sceneMotion = new Map<string, Set<string>>();
  const changing = new Map<string, boolean>();
  for (const clip of doc.clips) {
    const window = windows.get(clip.id);
    if (!window) {
      continue;
    }
    const animations = resolveBeatAnimations(clip, doc.tempo);
    const compiled = compileClipAnimations(animations, clip.durationMs, canvas);
    const hasChange = compiled.some(
      (animation) =>
        clip.startMs + animation.windowStartMs < window.end &&
        clip.startMs + animation.windowEndMs > window.start &&
        animation.curves.some((curve) => curve.keyframes.some((k) => k.value !== curve.keyframes[0]?.value))
    );
    changing.set(clip.id, hasChange);
    if (hasChange) {
      const scene = sceneIdFor(clip, byId);
      if (scene) {
        const set = sceneMotion.get(scene) ?? new Set<string>();
        set.add(clip.id);
        sceneMotion.set(scene, set);
      }
    }
  }
  for (const clip of doc.clips) {
    if (clip.mediaType !== "text" || !clip.textStyle || !hasVisualContent(clip)) {
      continue;
    }
    const window = windows.get(clip.id);
    if (!window || window.end - window.start < COUNTER_MIN_VISIBLE_MS) {
      continue;
    }
    if (!looksLikeCounter(clip, canvas)) {
      continue;
    }
    const animations = resolveBeatAnimations(clip, doc.tempo);
    // A fade-in or scale-in entrance is normal on any title, ticking or not,
    // and does not change the digits on screen — only a textAnimator (a
    // ticker or a scramble) or a style track that touches the text itself
    // does. Excluding on *any* changing curve (position, opacity, scale)
    // missed a real frozen "25:00": the clip's own entrance fade satisfied
    // that check while the number never moved.
    const changesDisplayedText = (animations ?? []).some(
      (a) => a.textAnimator || a.styleTracks?.some((track) => track.target.startsWith("textStyle."))
    );
    if (changesDisplayedText) {
      continue;
    }
    const scene = sceneIdFor(clip, byId);
    const sceneAnimated = scene ? (sceneMotion.get(scene)?.size ?? 0) > 0 : false;
    if (!sceneAnimated) {
      continue;
    }
    issues.push({
      severity: "warning",
      code: "showcase_dead_motion",
      clipId: clip.id,
      message: `Dead motion: "${clip.name || clip.id}" reads as a counter ("${clip.textStyle.text}") but never changes across ${((window.end - window.start) / 1000).toFixed(1)}s while its scene animates around it. See prism or voltra: a ticker textAnimator (\`preset: "custom"\`, \`textAnimator: { kind: "ticker", from, to }\`) counts it up on screen.`
    });
  }
  for (const clip of doc.clips) {
    const window = windows.get(clip.id);
    if (!window) {
      continue;
    }
    const animations = resolveBeatAnimations(clip, doc.tempo);
    const animationsById = new Map((animations ?? []).map((a) => [a.id, a]));
    const compiled = compileClipAnimations(animations, clip.durationMs, canvas);
    for (const animation of compiled) {
      const source = animationsById.get(animation.id);
      if (source?.textAnimator?.kind !== "ticker") {
        continue;
      }
      const tickerStart = clip.startMs + animation.windowStartMs;
      const visibleMs = window.end - window.start;
      if (visibleMs <= 0) {
        continue;
      }
      // A ticker that finishes before the clip is visible just holds its
      // counted-up value, same as one that runs at the very start — a normal
      // "count once, then hold" reveal. Only a ticker that has not *started*
      // for most of the clip's visible time is dead: the viewer watches the
      // un-animated `from` value with nothing telling them it will move.
      const neverStarts = tickerStart >= window.end;
      const preRollMs = Math.max(0, Math.min(tickerStart, window.end) - window.start);
      if (neverStarts || preRollMs / visibleMs > TICKER_PREROLL_FLOOR) {
        const relation = neverStarts ? "never starts within" : "does not start until most of the way through";
        issues.push({
          severity: "warning",
          code: "showcase_dead_motion",
          clipId: clip.id,
          message: `Dead motion: "${clip.name || clip.id}"'s ticker ${relation} its ${(visibleMs / 1000).toFixed(1)}s visible span, so it shows the un-animated start value for most of the time it is on screen. See prism or voltra: the ticker's window sits inside the clip's own visible span. Move the clip's start or the animation's delay so they align.`
        });
      }
    }
  }
  return issues;
}

export function checkShowcase(
  doc: TimelineDocument,
  canvas: { width: number; height: number }
): TimelineDebugIssue[] {
  const windows = activeWindows(doc);
  const visual = doc.clips.filter(
    (clip) => windows.get(clip.id) && hasVisualContent(clip)
  );
  const usedGroups = new Set<string>();
  const byId = new Map(doc.clips.map((clip) => [clip.id, clip]));
  // Stop at a previously visited ancestor, so shared or deep chains remain linear.
  for (const clip of visual) {
    let parent = clip.parentId ? byId.get(clip.parentId) : undefined;
    while (parent?.mediaType === "group" && !usedGroups.has(parent.id)) {
      usedGroups.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  const visualIds = new Set(visual.map((clip) => clip.id));
  const structural = doc.clips.filter(
    (clip) => usedGroups.has(clip.id) || visualIds.has(clip.id)
  );
  const visibleWindows = visual.flatMap((clip) => {
    const window = windows.get(clip.id);
    return window ? [window] : [];
  });
  const support = [...visibleWindows].sort((a, b) => a.start - b.start);
  const merged: Window[] = [];
  for (const window of support) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  const overlapsVisible = (window: Window): boolean => {
    let low = 0;
    let high = merged.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = merged[mid];
      if (candidate && candidate.end <= window.start) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const candidate = merged[low];
    return Boolean(candidate && candidate.start < window.end);
  };
  const active = doc.clips.filter((clip) => {
    const window = windows.get(clip.id);
    return (
      window &&
      (usedGroups.has(clip.id) ||
        visualIds.has(clip.id) ||
        (clip.mediaType === "adjustment" &&
          (!clip.parentId || usedGroups.has(clip.parentId)) &&
          overlapsVisible(window)))
    );
  });
  let customCount = 0;
  const fastWithoutBlur: string[] = [];
  for (const clip of active) {
    const window = windows.get(clip.id);
    if (!window) {
      continue;
    }
    const animations = resolveBeatAnimations(clip, doc.tempo);
    const compiled = compileClipAnimations(animations, clip.durationMs, canvas);
    let fast = false;
    for (const animation of compiled) {
      if (
        clip.startMs + animation.windowStartMs >= window.end ||
        clip.startMs + animation.windowEndMs <= window.start
      ) {
        continue;
      }
      for (const curve of animation.curves) {
        const dimension = ["positionX", "offsetX"].includes(curve.property)
          ? canvas.width
          : ["positionY", "offsetY"].includes(curve.property)
            ? canvas.height
            : ["scale", "scaleX", "scaleY"].includes(curve.property)
              ? 1
              : 0;
        if (!dimension) {
          continue;
        }
        for (let i = 1; i < curve.keyframes.length; i += 1) {
          const a = curve.keyframes[i - 1];
          const b = curve.keyframes[i];
          if (!a || !b) {
            continue;
          }
          const seconds =
            ((b.t - a.t) *
              (animation.stagger?.unitDurationMs ??
                animation.periodMs ??
                animation.windowEndMs - animation.windowStartMs)) /
            1000;
          if (seconds <= 0) {
            continue;
          }
          const speed = Math.abs(b.value - a.value) / dimension / seconds;
          fast ||=
            speed >
            (dimension === 1
              ? FAST_SCALE_PER_SECOND
              : FAST_POSITION_PER_SECOND);
        }
      }
    }
    const customAnimations = animations?.filter((a) => a.preset === "custom");
    const customById = new Map(customAnimations?.map((a) => [a.id, a]));
    customCount += compileClipAnimations(
      customAnimations,
      clip.durationMs,
      canvas
    ).filter(
      (animation) =>
        clip.startMs + animation.windowStartMs < window.end &&
        clip.startMs + animation.windowEndMs > window.start &&
        (animation.curves.some((curve) =>
          curve.keyframes.some((k) => k.value !== curve.keyframes[0]?.value)
        ) ||
          customById
            .get(animation.id)
            ?.styleTracks?.some((track) =>
              track.keyframes.some((k) => k.value !== track.keyframes[0]?.value)
            ) ||
          customById.get(animation.id)?.textAnimator)
    ).length;
    if (
      fast &&
      !(
        clip.motionBlur &&
        clip.motionBlur.shutterAngle > 0 &&
        clip.motionBlur.samplesPerFrame >= 2
      )
    ) {
      fastWithoutBlur.push(clip.name || clip.id);
    }
  }
  const custom = customCount > 0;
  const seconds = visibleWindows.length
    ? (visibleWindows.reduce((end, w) => Math.max(end, w.end), 0) -
        visibleWindows.reduce(
          (start, w) => Math.min(start, w.start),
          Infinity
        )) /
      1000
    : 0;
  const activeTrackIds = new Set(active.map((clip) => clip.trackId));
  const effectTypes = new Set(
    [
      ...active.flatMap((clip) => clip.effects ?? []),
      ...doc.tracks
        .filter((track) => activeTrackIds.has(track.id))
        .flatMap((track) => track.effects ?? [])
    ]
      .filter(
        (effect) => effect.enabled && parseClipEffectType(effect.type) !== null
      )
      .map((effect) => effect.type)
  );
  const customDensity = seconds > 0 ? customCount / seconds : 0;
  const clipDensity = seconds > 0 ? active.length / seconds : 0;
  const finish = active.some((clip) => clip.effects?.some(hasFinish));
  const camera = Boolean(
    doc.camera2d &&
    (structural.some((clip) => clip.transform?.depthPx !== undefined) ||
      doc.camera2d.keyframes?.some(
        (k) =>
          k.depthPx !== doc.camera2d?.depthPx ||
          k.position.x !== doc.camera2d?.position.x ||
          k.position.y !== doc.camera2d?.position.y
      ))
  );
  const coverage = layerCoverage(visibleWindows);
  const issues: TimelineDebugIssue[] = [];
  const warn = (code: string, message: string): void => {
    issues.push({ severity: "warning", code, message });
  };
  if (usedGroups.size === 0) {
    warn(
      "showcase_scene_groups_missing",
      "Showcase structure: no active scene group contains visible content. See voltra: grouped beats and hero rigs. Parent each scene's visual clips to a group so its timing and motion can be directed together."
    );
  }
  if (!custom) {
    warn(
      "showcase_custom_motion_missing",
      "Showcase structure: no active custom animation has changing keyframes in its visible window. See tidewater: secondary curves. Add a custom curve to a visible clip or scene group and check its timing."
    );
  }
  if (!finish) {
    warn(
      "showcase_finish_missing",
      "Showcase structure: no active grain, vignette or non-neutral color grade is enabled on visible content or an adjustment. See serein: grain and vignette on the finish. Add a restrained finish and inspect a rendered frame."
    );
  }
  // Prism and tidewater establish dense planar motion without a camera.
  const densePlanar =
    usedGroups.size >= SHOWCASE_FLOOR.groups &&
    customDensity >= SHOWCASE_FLOOR.customPerSecond &&
    effectTypes.size >= SHOWCASE_FLOOR.effects;
  if (!camera && !densePlanar) {
    warn(
      "showcase_camera_missing",
      "Showcase structure: no camera2d affects a visible clip or scene group with transform.depthPx. See serein: camera push across depth planes. Set the camera and layer depth, then preview the framing."
    );
  }
  if (coverage < MIN_COVERAGE) {
    warn(
      "showcase_layer_density_low",
      `Showcase structure: at least ${MIN_LAYERS} concurrent visual clips cover ${Math.round(coverage * 100)}% of the first-to-last visible span (target ${MIN_COVERAGE * 100}%). See prism: layered plates and light. Build bed, midground and foreground across the scene. Groups, adjustments, audio, hidden or empty clips do not count. This static proxy does not judge occlusion, rendered depth or aesthetic quality.`
    );
  }
  if (usedGroups.size < SHOWCASE_FLOOR.groups) {
    warn(
      "showcase_scene_group_density_low",
      `Scene-group gap: ${usedGroups.size} active groups, floor ${SHOWCASE_FLOOR.groups}, example median ${SHOWCASE_TARGET.groups}. See voltra: scene groups direct each beat and nested hero rig.`
    );
  }
  if (customDensity < SHOWCASE_FLOOR.customPerSecond) {
    warn(
      "showcase_custom_animation_density_low",
      `Custom-motion gap: ${customCount} active changing animations over ${seconds.toFixed(2)} visible seconds (${customDensity.toFixed(2)}/s), floor ${SHOWCASE_FLOOR.customPerSecond.toFixed(2)}/s, example median ${SHOWCASE_TARGET.customPerSecond.toFixed(2)}/s. See tidewater: secondary curves and textured scene motion.`
    );
  }
  if (
    effectTypes.size < SHOWCASE_FLOOR.effects ||
    ![...effectTypes].some((type) => !FINISH_EFFECT_TYPES.includes(type))
  ) {
    warn(
      "showcase_effect_variety_low",
      `Effect-variety gap: ${effectTypes.size} enabled types, floor ${SHOWCASE_FLOOR.effects}, example median ${SHOWCASE_TARGET.effects}. A finish alone is insufficient. Add a non-finishing type such as glow or generator. See kite: repeater + glow on the logo, generator beds and stylize accents.`
    );
  }
  if (clipDensity < SHOWCASE_FLOOR.clipsPerSecond) {
    warn(
      "showcase_clip_density_low",
      `Clip-density gap: ${active.length} active clips over ${seconds.toFixed(2)} visible seconds (${clipDensity.toFixed(2)}/s), floor ${SHOWCASE_FLOOR.clipsPerSecond.toFixed(2)}/s, example median ${SHOWCASE_TARGET.clipsPerSecond.toFixed(2)}/s. See prism: overlapping plates, light and supporting geometry.`
    );
  }
  if (fastWithoutBlur.length) {
    warn(
      "showcase_motion_blur_missing",
      `Motion-blur gap: ${fastWithoutBlur.join(", ")} exceed ${FAST_POSITION_PER_SECOND} canvas widths/heights per second or ${FAST_SCALE_PER_SECOND} scale units per second without a positive shutter and at least two samples. See kite: blur on the fast logo move.`
    );
  }
  const children = childrenByParentMap(doc);
  // The same layout resolver the renderer places a `row`/`stack`/`relative`
  // container's children with (packages/timeline/src/render/layout.ts). No
  // `measureText` is supplied: execution has no canvas dependency, so this
  // falls back to the module's own `text.length * fontSizePx * 0.6`
  // estimate — the exact fallback the renderer itself uses headless when it
  // has no measurer either, so this file's own text-box estimate elsewhere
  // and the layout resolver's estimate here read from the same yardstick.
  const layoutResolved = resolveClipLayoutsWithDiagnostics(doc.clips, canvas);
  const resolved = layoutResolved.transforms;
  const sizes = layoutResolved.sizes;
  issues.push(
    ...checkFrameUnderfilled(doc, canvas, windows, byId, children, resolved, sizes),
    ...checkTextCollision(doc, canvas, windows, byId, resolved, sizes),
    ...checkMotionRangeNarrow(doc, canvas, windows),
    ...checkDeadMotion(doc, canvas, windows, byId)
  );
  return issues;
}

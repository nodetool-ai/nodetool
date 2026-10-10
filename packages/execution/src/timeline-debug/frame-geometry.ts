/**
 * frame-geometry — a clip's static axis-aligned box in frame pixels.
 *
 * Shared by every timeline-debug check that needs to know roughly where a
 * clip sits on screen without rendering: `showcase.ts` (frame coverage, text
 * collision) and `legibility.ts` (which shape is actually the backdrop
 * behind a title). One computation here, not two that could disagree about
 * where a clip is.
 *
 * Static geometry only, same rule `showcase.ts` documents for its own
 * checks: no rendered pixels, no sampled animation curves, no occlusion. A
 * box is the clip's own authored (or layout-resolved) transform projected
 * into frame pixels — the scene model's placement math
 * (`buildTransformMatrix`, `layoutTextBlock`), not a second implementation
 * of it — composed through every ancestor group's transform in one matrix,
 * the way `parentMatrix` composes it for a real render.
 */
import type {
  ClipTransform,
  TimelineClip
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  buildTransformMatrix,
  containBaseScale,
  IDENTITY_TRANSFORM,
  layoutTextBlock,
  parseSvgPath
} from "@nodetool-ai/timeline/scene";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A `path` shape's frame-pixel bounding box from its `d` data, or
 * `undefined` when the data does not parse. Cubic/quad control points are
 * included, which can only overestimate the box (Bezier curves stay inside
 * their control points' convex hull) — the safe direction for a proxy that
 * would otherwise call a small mark a full-frame background bed. */
function svgPathLocalBox(d: string, canvas: { width: number; height: number }): Box | undefined {
  const parsed = parseSvgPath(d);
  if (!parsed.ok) {
    return undefined;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const consider = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const segment of parsed.segments) {
    if (segment.kind === "move" || segment.kind === "line") {
      consider(segment.x, segment.y);
    } else if (segment.kind === "quad") {
      consider(segment.x1, segment.y1);
      consider(segment.x, segment.y);
    } else if (segment.kind === "cubic") {
      consider(segment.x1, segment.y1);
      consider(segment.x2, segment.y2);
      consider(segment.x, segment.y);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return undefined;
  }
  return {
    x: minX * canvas.width,
    y: minY * canvas.height,
    width: (maxX - minX) * canvas.width,
    height: (maxY - minY) * canvas.height
  };
}

/** Pre-transform box in frame pixels. `undefined` for a kind this proxy does
 * not measure (audio, group, adjustment). A media clip's box is the whole
 * frame — its contain-fit base scale is applied in `frameBoxFor`.
 *
 * `sizeOverride` is the box a flex container resized this leaf to
 * (`resolveClipLayoutsWithDiagnostics`'s `sizes` map) — the same override
 * `sceneModel.ts`'s `emitMedia` applies to the clip it hands the renderer, so
 * a flex-resized plate or a rewrapped text block measures at the size it
 * actually draws at, not its pre-layout authored one. */
export function localBox(
  clip: TimelineClip,
  canvas: { width: number; height: number },
  sizeOverride?: { width: number; height: number }
): Box | undefined {
  if (clip.mediaType === "text" && clip.textStyle) {
    const style = sizeOverride
      ? { ...clip.textStyle, maxWidthFrac: Math.min(1, Math.max(0.05, sizeOverride.width / canvas.width)) }
      : clip.textStyle;
    const measure = (text: string): number => text.length * style.fontSizePx * 0.6;
    return layoutTextBlock(measure, style, canvas.width, canvas.height).box;
  }
  if (clip.mediaType === "shape" && clip.shapeStyle) {
    const shape = clip.shapeStyle;
    // A resized shape is pinned to the top-left, not `shapeBox`'s centered
    // (0.25/0.25) default for an unset origin — the same convention
    // `sceneModel.ts`'s own size override uses, because the box being
    // measured is from the frame's top-left.
    if (sizeOverride) {
      return { x: 0, y: 0, width: sizeOverride.width, height: sizeOverride.height };
    }
    // A `path` shape has no `x`/`y`/`width`/`height` of its own — those
    // fields default a `rect`/`ellipse`/`polygon` to the full frame, which is
    // exactly wrong for a small hand-drawn mark and reads as a giant
    // background bed that then collides with everything on screen.
    if (shape.kind === "path" && shape.d) {
      return svgPathLocalBox(shape.d, canvas) ?? { x: 0, y: 0, width: 0, height: 0 };
    }
    return {
      x: (shape.x ?? 0) * canvas.width,
      y: (shape.y ?? 0) * canvas.height,
      width: (shape.width ?? 1) * canvas.width,
      height: (shape.height ?? 1) * canvas.height
    };
  }
  if (["image", "video", "overlay", "model3d"].includes(clip.mediaType)) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }
  return undefined;
}

function mediaBase(clip: TimelineClip, canvas: { width: number; height: number }) {
  if (!["image", "video", "overlay", "model3d"].includes(clip.mediaType)) {
    return { x: 1, y: 1 };
  }
  return containBaseScale(clip.width ?? canvas.width, clip.height ?? canvas.height, canvas.width, canvas.height);
}

export function projectPoint(
  x: number,
  y: number,
  matrix: Float32Array,
  canvas: { width: number; height: number }
) {
  const nx = (2 * x) / canvas.width - 1;
  const ny = 1 - (2 * y) / canvas.height;
  const w = matrix[3]! * nx + matrix[7]! * ny + matrix[15]!;
  const px = (matrix[0]! * nx + matrix[4]! * ny + matrix[12]!) / w;
  const py = (matrix[1]! * nx + matrix[5]! * ny + matrix[13]!) / w;
  return { x: ((px + 1) * canvas.width) / 2, y: ((1 - py) * canvas.height) / 2 };
}

export function projectBox(box: Box, matrix: Float32Array, canvas: { width: number; height: number }): Box {
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height]
  ].map(([x, y]) => projectPoint(x!, y!, matrix, canvas));
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  return {
    x: left,
    y: top,
    width: Math.max(...points.map((p) => p.x)) - left,
    height: Math.max(...points.map((p) => p.y)) - top
  };
}

/** Root-first chain of the clip and every ancestor group it is parented to.
 * Stops at the first non-group parent, same as the scene model. A chain that
 * loops back on itself is refused (`parent_cycle` in `validate.ts`), so the
 * clip is treated as unparented. */
export function ancestorChain(clip: TimelineClip, byId: ReadonlyMap<string, TimelineClip>): TimelineClip[] {
  const chain: TimelineClip[] = [clip];
  const seen = new Set([clip.id]);
  let parent = clip.parentId ? byId.get(clip.parentId) : undefined;
  while (parent?.mediaType === "group") {
    if (seen.has(parent.id)) {
      return [clip];
    }
    seen.add(parent.id);
    chain.push(parent);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return chain.reverse();
}

/** Whether `clip` or an ancestor carries a 3D tilt (`rotationX`/`rotationY`)
 * or `perspective`. An axis-aligned box is not a sound proxy for a layer
 * under a projective transform: the true screen footprint is a distorted
 * quadrilateral, and its AABB can be several times taller or narrower than
 * the source box even for ordinary content — a tilted phone-mockup card is
 * the shipped example that shows it. Checks relying on the frame box skip
 * these clips rather than report a geometry the transform makes up. */
export function hasPerspectiveAncestor(clip: TimelineClip, byId: ReadonlyMap<string, TimelineClip>): boolean {
  return ancestorChain(clip, byId).some((ancestor) => {
    const t = ancestor.transform;
    return Boolean(t && (t.rotationX || t.rotationY || t.perspective));
  });
}

/** `clip`'s transform, or the position/scale a `row`/`stack`/`relative`
 * container resolved for it — the same override the renderer places a
 * layout-managed child with. A clip's own `transform` is stale once it sits
 * in a container: the container decides its box, and measuring the authored
 * field instead reads two stack siblings as stacked at the same spot no
 * matter how far the container's `gapPx` actually holds them apart. */
export function resolvedTransform(
  clip: TimelineClip,
  resolved: ReadonlyMap<string, ClipTransform>
): ClipTransform {
  return resolved.get(clip.id) ?? clip.transform ?? IDENTITY_TRANSFORM;
}

/** `transform` with any 3D tilt zeroed — same position/scale/z-rotation, no
 * `rotationX`/`rotationY`/`perspective`. Used only for frame coverage (see
 * `showcase.ts`'s `checkFrameUnderfilled`), where an untilted footprint is a
 * closer approximation of "how much of the frame this covers" than a
 * projective AABB, which can be inflated or skewed under a tilt in a way
 * area alone should not be. */
export function untiltedTransform(transform: ClipTransform): ClipTransform {
  if (!transform.rotationX && !transform.rotationY && !transform.perspective) {
    return transform;
  }
  return { ...transform, rotationX: undefined, rotationY: undefined, perspective: undefined };
}

/** `clip`'s (or an overridden local box's) axis-aligned box in frame pixels,
 * composing every ancestor group's transform into one matrix before
 * projecting — a rotated ancestor does not inflate the box the way
 * re-projecting an AABB at each level would. Static: the authored transform,
 * not an animated sample. `flattenPerspective` strips 3D tilt from every
 * ancestor first (see `untiltedTransform`) — an approximation a caller opts
 * into explicitly, never the default.
 *
 * `resolved` (`resolveClipLayoutsWithDiagnostics`'s `transforms` map) is
 * PARENT-LOCAL (packages/timeline/AGENTS.md, "PARENT-LOCAL"): a flex-managed
 * clip's resolved `position` is relative to its flex root's own untranslated
 * frame, with every intermediate flex container's own translation already
 * folded in — never the root's own placement, and never doubled. The
 * renderer (`sceneModel.ts`'s `groupPatchedClips`) adds each ancestor's real
 * translation back exactly once by zeroing a flex-managed *ancestor's* own
 * `position` before composing it (keeping any rotation/scale the author put
 * on it — flex only ever touches `position`), while the target clip itself
 * keeps its full resolved position. This mirrors that: only an ancestor
 * (never the clip whose box this is) gets its flex-resolved position
 * stripped.
 */
export function composedMatrix(
  clip: TimelineClip,
  canvas: { width: number; height: number },
  byId: ReadonlyMap<string, TimelineClip>,
  resolved: ReadonlyMap<string, ClipTransform>,
  flattenPerspective = false
): Float32Array {
  let matrix: Float32Array | undefined;
  for (const ancestor of ancestorChain(clip, byId)) {
    const isTarget = ancestor === clip;
    const base = isTarget ? mediaBase(clip, canvas) : { x: 1, y: 1 };
    const flexEntry = resolved.get(ancestor.id);
    const t = isTarget
      ? (flexEntry ?? ancestor.transform ?? IDENTITY_TRANSFORM)
      : flexEntry
        ? { ...flexEntry, position: { x: 0, y: 0 } }
        : (ancestor.transform ?? IDENTITY_TRANSFORM);
    matrix = buildTransformMatrix(flattenPerspective ? untiltedTransform(t) : t, base, canvas.width, canvas.height, matrix);
  }
  return matrix!;
}

export function frameBoxFor(
  clip: TimelineClip,
  canvas: { width: number; height: number },
  byId: ReadonlyMap<string, TimelineClip>,
  resolved: ReadonlyMap<string, ClipTransform>,
  overrideLocal?: Box,
  flattenPerspective = false,
  sizes?: ReadonlyMap<string, { width: number; height: number }>
): Box | undefined {
  // A flex container can resize a leaf far past its authored `shapeStyle`/
  // `textStyle` box (a plate stretched to `inset: 0` behind a title, a text
  // block rewrapped to a narrower column) — `sizes` is the box that resized
  // it to, the same map `sceneModel.ts`'s `emitMedia` reads to build the
  // clip the renderer actually draws. The clip's resolved *position* already
  // comes from `resolved` the ordinary way (`resolvedTransform`, below); only
  // the pre-transform local box's own width/height need the override, so the
  // position/rotation/scale composition every other clip goes through here
  // stays the one path, flex-resized or not.
  const own = overrideLocal ?? localBox(clip, canvas, sizes?.get(clip.id));
  if (!own) {
    return undefined;
  }
  return projectBox(own, composedMatrix(clip, canvas, byId, resolved, flattenPerspective), canvas);
}

/** A box covering this much of the frame is a bed, not content — see
 * `showcase.ts`. Not used by `legibility.ts`, which wants the opposite: a
 * full-frame shape is still a valid backdrop to read a colour off. */
export const BACKGROUND_COVERAGE = 0.9;

export function isBackgroundBed(box: Box, canvas: { width: number; height: number }): boolean {
  return box.width * box.height >= BACKGROUND_COVERAGE * canvas.width * canvas.height;
}

export function containsBox(outer: Box, inner: Box, eps = 0.5): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}

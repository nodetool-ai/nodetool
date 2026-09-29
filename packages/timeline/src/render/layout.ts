import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  PositionType,
  Wrap
} from "yoga-layout";
import type { Node as YogaNode } from "yoga-layout";
import type {
  ClipFlexItem,
  ClipLayout,
  ClipLayoutDimension,
  ClipLayoutEdges,
  ClipShapeStyle,
  ClipTransform,
  FlexAlign,
  FlexJustify,
  TimelineClip
} from "../types.js";
import { layoutTextBlock, textFontSpec, type RenderCanvas } from "./textLayout.js";
import { IDENTITY_TRANSFORM, buildTransformMatrix, containBaseScale } from "./transform.js";
import { parseSvgPath, pathSegmentBounds } from "./svgPath.js";

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function projectedBox(box: LayoutBox, transform: ClipTransform, canvas: RenderCanvas, base = { x: 1, y: 1 }): LayoutBox {
  const matrix = buildTransformMatrix(transform, base, canvas.width, canvas.height);
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height]
  ];
  const points = corners.map(([x, y]) => {
    const nx = 2 * x / canvas.width - 1;
    const ny = 1 - 2 * y / canvas.height;
    const w = matrix[3] * nx + matrix[7] * ny + matrix[15];
    const px = (matrix[0] * nx + matrix[4] * ny + matrix[12]) / w;
    const py = (matrix[1] * nx + matrix[5] * ny + matrix[13]) / w;
    return { x: (px + 1) * canvas.width / 2, y: (1 - py) * canvas.height / 2 };
  });
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  return {
    x: left - canvas.width / 2,
    y: top - canvas.height / 2,
    width: Math.max(...points.map((point) => point.x)) - left,
    height: Math.max(...points.map((point) => point.y)) - top
  };
}

/**
 * A shape's own box before any transform, in surface pixels: the authored
 * `x`/`y`/`width`/`height` for every kind except `"path"`, where those
 * fields go unused by the draw code entirely (`buildShapeSegments` scales a
 * path's `d` straight to the full canvas — see `shapeGeometry.ts`). A path
 * with no authored `width`/`height` gets its real box from `d`'s own
 * geometry — {@link pathSegmentBounds} of its parsed segments — instead of
 * `fallback`, so an author does not have to hand-measure a path's extent
 * just to give it a `flexItem` size. A path that fails to parse, or one
 * whose `d` is empty, falls back like every other unset shape does; the
 * validator's `shape_path_invalid` already reports the parse failure itself.
 */
function shapeAuthoredBox(shape: ClipShapeStyle, canvas: RenderCanvas, fallback: LayoutBox): LayoutBox {
  if (shape.kind === "path" && shape.width === undefined && shape.height === undefined) {
    const parsed = parseSvgPath(shape.d ?? "");
    if (parsed.ok) {
      const bounds = pathSegmentBounds(parsed.segments);
      if (bounds) {
        return {
          x: bounds.minX * canvas.width,
          y: bounds.minY * canvas.height,
          width: (bounds.maxX - bounds.minX) * canvas.width,
          height: (bounds.maxY - bounds.minY) * canvas.height
        };
      }
    }
  }
  return {
    x: (shape.x ?? fallback.x) * canvas.width,
    y: (shape.y ?? fallback.y) * canvas.height,
    width: (shape.width ?? fallback.width) * canvas.width,
    height: (shape.height ?? fallback.height) * canvas.height
  };
}

/**
 * The box a clip's own content currently renders at (canvas-center-relative
 * pixels): a group's children union, a text clip's wrapped block, a shape's
 * authored rectangle, or a media clip's contain-fit frame — each placed by
 * the clip's *current* `transform`. This is what {@link resolveClipLayouts}
 * measures a leaf's flex intrinsic size from, and what the flex resolver
 * diffs against a Yoga-computed target box to find how far `transform.position`
 * has to move (see `moved` below) — so placing a clip is always "shift
 * position by the same delta that would shift this box," regardless of scale,
 * rotation or anchor.
 */
function measuredClipBox(clip: TimelineClip, canvas: RenderCanvas, childrenByParent: ReadonlyMap<string, TimelineClip[]>, visited: Set<string>): LayoutBox {
  const transform = clip.transform ?? IDENTITY_TRANSFORM;
  if (clip.mediaType === "group") {
    if (visited.has(clip.id)) return { x: 0, y: 0, width: 0, height: 0 };
    visited.add(clip.id);
    const children = childrenByParent.get(clip.id) ?? [];
    const boxes = children.map((child) => measuredClipBox(child, canvas, childrenByParent, visited)).filter((box) => box.width > 0 && box.height > 0);
    visited.delete(clip.id);
    if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const x0 = Math.min(...boxes.map((box) => box.x));
    const y0 = Math.min(...boxes.map((box) => box.y));
    const x1 = Math.max(...boxes.map((box) => box.x + box.width));
    const y1 = Math.max(...boxes.map((box) => box.y + box.height));
    return projectedBox({ x: x0 + canvas.width / 2, y: y0 + canvas.height / 2, width: x1 - x0, height: y1 - y0 }, transform, canvas);
  }
  if (clip.mediaType === "text" && clip.textStyle) {
    const style = clip.textStyle;
    const font = textFontSpec(style);
    const measure = canvas.measureText
      ? (text: string) => canvas.measureText?.(text, font) ?? 0
      : (text: string) => text.length * style.fontSizePx * 0.6;
    const box = layoutTextBlock(measure, style, canvas.width, canvas.height).box;
    return projectedBox(box, transform, canvas);
  }
  if (clip.mediaType === "shape" && clip.shapeStyle) {
    const box = shapeAuthoredBox(clip.shapeStyle, canvas, { x: 0, y: 0, width: 1, height: 1 });
    return projectedBox(box, transform, canvas);
  }
  const size = containBaseScale(clip.width ?? canvas.width, clip.height ?? canvas.height, canvas.width, canvas.height);
  return projectedBox({ x: 0, y: 0, width: canvas.width, height: canvas.height }, transform, canvas, size);
}

function indexChildren(clips: readonly TimelineClip[]): Map<string, TimelineClip[]> {
  const index = new Map<string, TimelineClip[]>();
  for (const clip of clips) {
    if (!clip.parentId) continue;
    const children = index.get(clip.parentId) ?? [];
    children.push(clip);
    index.set(clip.parentId, children);
  }
  return index;
}

function boxFor(clip: TimelineClip, canvas: RenderCanvas, childrenByParent: ReadonlyMap<string, TimelineClip[]>): LayoutBox {
  return measuredClipBox(clip, canvas, childrenByParent, new Set());
}

/** The projected box in sequence pixels. Groups use their children's union. */
export function clipLayoutBox(clip: TimelineClip, canvas: RenderCanvas, clips: readonly TimelineClip[] = []): LayoutBox {
  return boxFor(clip, canvas, indexChildren(clips));
}

function moved(base: ClipTransform | undefined, x: number, y: number, scale?: { x: number; y: number }): ClipTransform {
  const source = base ?? IDENTITY_TRANSFORM;
  return { ...source, position: { x, y }, scale: scale ?? source.scale };
}

// ── Flex layout (Yoga) ──────────────────────────────────────────────────────
//
// See packages/timeline/AGENTS.md ("Layout is flexbox") for the contract this
// implements. In short: a `group` clip with `layout.display === "flex"` is a
// flex container for its REAL children (`parentId`); a child's own sizing
// lives on `flexItem`. Nesting is ordinary Yoga node nesting. Placement of a
// resolved box back onto a clip never touches `buildTransformMatrix`: every
// clip already renders its own content (text block, shape rect, media frame)
// centered on `transform.position` up to a fixed delta, so resolving a layout
// is "measure the clip's current box, diff it against the box Yoga computed,
// shift `position` by that diff" — `moved()` above is the whole primitive.

export interface ResolvedClipLayout {
  transform: ClipTransform;
  /** Present when flex resized the clip: a rect/ellipse's box, or a text
   * clip's wrap width via an effective `maxWidthFrac` the caller applies. */
  size?: { width: number; height: number };
}

function fourEdges(value: number | ClipLayoutEdges | undefined, fallback = 0): Required<ClipLayoutEdges> {
  if (value === undefined) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  return {
    top: value.top ?? fallback,
    right: value.right ?? fallback,
    bottom: value.bottom ?? fallback,
    left: value.left ?? fallback
  };
}

/** `ClipLayoutDimension` (px number, `"N%"`, or a numeric string) as Yoga's setter wants it. */
function yogaDimension(value: ClipLayoutDimension | undefined): number | `${number}%` | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return trimmed as `${number}%`;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Root-only: a container with no flex parent resolves a `"N%"` dimension
 * against the canvas, since it has no Yoga parent to resolve it against. */
function rootDimensionPx(value: ClipLayoutDimension | undefined, basisPx: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) ? (n / 100) * basisPx : undefined;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

const JUSTIFY_MAP: Record<FlexJustify, Justify> = {
  "flex-start": Justify.FlexStart,
  "flex-end": Justify.FlexEnd,
  center: Justify.Center,
  "space-between": Justify.SpaceBetween,
  "space-around": Justify.SpaceAround,
  "space-evenly": Justify.SpaceEvenly
};

const ALIGN_MAP: Record<FlexAlign, Align> = {
  "flex-start": Align.FlexStart,
  "flex-end": Align.FlexEnd,
  center: Align.Center,
  stretch: Align.Stretch,
  baseline: Align.Baseline
};

const ALIGN_CONTENT_MAP: Record<FlexJustify, Align> = {
  "flex-start": Align.FlexStart,
  "flex-end": Align.FlexEnd,
  center: Align.Center,
  "space-between": Align.SpaceBetween,
  "space-around": Align.SpaceAround,
  "space-evenly": Align.SpaceEvenly
};

const WRAP_MAP: Record<NonNullable<ClipLayout["flexWrap"]>, Wrap> = {
  nowrap: Wrap.NoWrap,
  wrap: Wrap.Wrap,
  "wrap-reverse": Wrap.WrapReverse
};

function applyContainerStyle(node: YogaNode, layout: ClipLayout, isRoot: boolean, canvas: RenderCanvas): void {
  node.setDisplay(Display.Flex);
  node.setFlexDirection(layout.flexDirection === "column" ? FlexDirection.Column : FlexDirection.Row);
  if (layout.justifyContent) node.setJustifyContent(JUSTIFY_MAP[layout.justifyContent]);
  if (layout.alignItems) node.setAlignItems(ALIGN_MAP[layout.alignItems]);
  if (layout.alignContent) node.setAlignContent(ALIGN_CONTENT_MAP[layout.alignContent]);
  if (layout.flexWrap) node.setFlexWrap(WRAP_MAP[layout.flexWrap]);
  if (layout.gap !== undefined) node.setGap(Gutter.All, layout.gap);
  if (layout.columnGap !== undefined) node.setGap(Gutter.Column, layout.columnGap);
  if (layout.rowGap !== undefined) node.setGap(Gutter.Row, layout.rowGap);
  const padding = fourEdges(layout.padding);
  node.setPadding(Edge.Top, padding.top);
  node.setPadding(Edge.Right, padding.right);
  node.setPadding(Edge.Bottom, padding.bottom);
  node.setPadding(Edge.Left, padding.left);

  if (isRoot) {
    const w = rootDimensionPx(layout.width, canvas.width);
    const h = rootDimensionPx(layout.height, canvas.height);
    if (w !== undefined) node.setWidth(w);
    if (h !== undefined) node.setHeight(h);
    const minW = rootDimensionPx(layout.minWidth, canvas.width);
    const maxW = rootDimensionPx(layout.maxWidth, canvas.width);
    const minH = rootDimensionPx(layout.minHeight, canvas.height);
    const maxH = rootDimensionPx(layout.maxHeight, canvas.height);
    if (minW !== undefined) node.setMinWidth(minW);
    if (maxW !== undefined) node.setMaxWidth(maxW);
    if (minH !== undefined) node.setMinHeight(minH);
    if (maxH !== undefined) node.setMaxHeight(maxH);
  } else {
    const w = yogaDimension(layout.width);
    const h = yogaDimension(layout.height);
    if (w !== undefined) node.setWidth(w);
    if (h !== undefined) node.setHeight(h);
    const minW = yogaDimension(layout.minWidth);
    const maxW = yogaDimension(layout.maxWidth);
    const minH = yogaDimension(layout.minHeight);
    const maxH = yogaDimension(layout.maxHeight);
    if (minW !== undefined) node.setMinWidth(minW);
    if (maxW !== undefined) node.setMaxWidth(maxW);
    if (minH !== undefined) node.setMinHeight(minH);
    if (maxH !== undefined) node.setMaxHeight(maxH);
  }
}

function applyFlexItemStyle(node: YogaNode, item: ClipFlexItem | undefined): void {
  // CSS's UA default is `flex-shrink: 1`; Yoga's own bare default is 0. Match
  // CSS so a leaf with a large intrinsic (measure-func) size — the common
  // case for an undecorated shape or media clip — still shrinks to fit a
  // container instead of overflowing it. Applies to every child, not only
  // one that authors a `flexItem`.
  node.setFlexShrink(item?.shrink ?? 1);
  if (!item) return;
  if (item.grow !== undefined) node.setFlexGrow(item.grow);
  const basis = yogaDimension(item.basis);
  if (basis !== undefined) node.setFlexBasis(basis);
  if (item.alignSelf) node.setAlignSelf(ALIGN_MAP[item.alignSelf]);
  const w = yogaDimension(item.width);
  const h = yogaDimension(item.height);
  if (w !== undefined) node.setWidth(w);
  if (h !== undefined) node.setHeight(h);
  const margin = fourEdges(item.margin);
  node.setMargin(Edge.Top, margin.top);
  node.setMargin(Edge.Right, margin.right);
  node.setMargin(Edge.Bottom, margin.bottom);
  node.setMargin(Edge.Left, margin.left);
  if (item.position === "absolute") {
    node.setPositionType(PositionType.Absolute);
    const inset = item.inset;
    if (typeof inset === "number") {
      node.setPosition(Edge.Top, inset);
      node.setPosition(Edge.Right, inset);
      node.setPosition(Edge.Bottom, inset);
      node.setPosition(Edge.Left, inset);
    } else if (inset) {
      if (inset.top !== undefined) node.setPosition(Edge.Top, inset.top);
      if (inset.right !== undefined) node.setPosition(Edge.Right, inset.right);
      if (inset.bottom !== undefined) node.setPosition(Edge.Bottom, inset.bottom);
      if (inset.left !== undefined) node.setPosition(Edge.Left, inset.left);
    }
  }
}

const MAX_TEXT_WRAP_FRAC = 1;

/** Intrinsic (measure-func) size of a leaf clip at Yoga's offered width. Only
 * a text clip actually reflows; every other kind returns a size independent
 * of the offered constraint, which is what makes a fixed `flexItem.width`/
 * `height` (set directly on the node, not through this function) the only
 * way to resize it. */
function measureLeaf(clip: TimelineClip, canvas: RenderCanvas, childrenByParent: ReadonlyMap<string, TimelineClip[]>, offeredWidth: number, widthMode: MeasureMode): { width: number; height: number } {
  if (clip.mediaType === "text" && clip.textStyle) {
    const style = clip.textStyle;
    const font = textFontSpec(style);
    const measure = canvas.measureText
      ? (text: string) => canvas.measureText?.(text, font) ?? 0
      : (text: string) => text.length * style.fontSizePx * 0.6;
    // A text clip ignores its own authored `maxWidthFrac` inside a flex tree
    // (see AGENTS.md): the width it wraps to is whatever Yoga is offering,
    // not what it was authored with. `MAX_TEXT_WRAP_FRAC` approximates an
    // unconstrained (max-content) measurement — the widest this API can ask
    // `layoutTextBlock` to try is the whole canvas.
    const effectiveFrac = canvas.width > 0 && widthMode !== MeasureMode.Undefined && Number.isFinite(offeredWidth)
      ? Math.min(MAX_TEXT_WRAP_FRAC, Math.max(0.05, offeredWidth / canvas.width))
      : MAX_TEXT_WRAP_FRAC;
    const effectiveStyle = { ...style, maxWidthFrac: effectiveFrac };
    const box = layoutTextBlock(measure, effectiveStyle, canvas.width, canvas.height).box;
    return { width: box.width, height: box.height };
  }
  if (clip.mediaType === "shape" && clip.shapeStyle) {
    // Outside a flex tree an unset width/height defaults to the whole frame
    // (`measuredClipBox` above). Inside one, that default would make an
    // undecorated shape's mere presence claim the whole main axis as its
    // flex-basis and force every sibling with `grow`/an explicit size into a
    // shrink negotiation it was never meant to be in — so the fallback here
    // is 0 (CSS's own `flex-basis: auto` on a sizeless replaced element),
    // and `flexItem.grow`/`.width`/`.height` are what actually size it. A
    // `"path"` shape's real geometry (its `d`) overrides that 0 fallback
    // regardless — see `shapeAuthoredBox` — so an author gets a usable
    // intrinsic size without hand-measuring the curve.
    const box = shapeAuthoredBox(clip.shapeStyle, canvas, { x: 0, y: 0, width: 0, height: 0 });
    return { width: box.width, height: box.height };
  }
  if (clip.mediaType === "group") {
    // A plain (non-flex) group nested as a flex leaf: its intrinsic size is
    // its own unmanaged children's union box, exactly as `clipLayoutBox`
    // already reports it outside a flex tree.
    const box = boxFor(clip, canvas, childrenByParent);
    return { width: box.width || canvas.width, height: box.height || canvas.height };
  }
  // image / video / model3d / audio / adjustment / midi: no reflow, and no
  // authored size beyond `clip.width`/`clip.height` (source pixels, not a
  // layout hint) — the frame-filling default `measuredClipBox` already uses.
  return { width: canvas.width, height: canvas.height };
}

interface BuiltNode {
  node: YogaNode;
  clip: TimelineClip;
  isFlexContainer: boolean;
}

/**
 * Build one Yoga node per clip in a flex subtree, recursively, in document
 * order. `visited` guards a `parentId` cycle: a clip already on the current
 * path is treated as a childless leaf and reported back through `cycles`.
 */
function buildTree(
  clip: TimelineClip,
  canvas: RenderCanvas,
  childrenByParent: ReadonlyMap<string, TimelineClip[]>,
  isRoot: boolean,
  visited: Set<string>,
  built: Map<string, BuiltNode>,
  cycles: Set<string>
): YogaNode {
  const node = Yoga.Node.create();
  const isFlexContainer = clip.mediaType === "group" && clip.layout?.display === "flex";
  built.set(clip.id, { node, clip, isFlexContainer });

  if (isFlexContainer) {
    applyContainerStyle(node, clip.layout as ClipLayout, isRoot, canvas);
    if (visited.has(clip.id)) {
      cycles.add(clip.id);
      return node;
    }
    visited.add(clip.id);
    const children = childrenByParent.get(clip.id) ?? [];
    children.forEach((child, index) => {
      const childNode = buildTree(child, canvas, childrenByParent, false, visited, built, cycles);
      applyFlexItemStyle(childNode, child.flexItem);
      node.insertChild(childNode, index);
    });
    visited.delete(clip.id);
  } else {
    node.setMeasureFunc((width, widthMode, _height, _heightMode) =>
      measureLeaf(clip, canvas, childrenByParent, width, widthMode)
    );
  }
  return node;
}

function collectAbsolutePositions(
  clip: TimelineClip,
  node: YogaNode,
  originX: number,
  originY: number,
  built: ReadonlyMap<string, BuiltNode>,
  childrenByParent: ReadonlyMap<string, TimelineClip[]>,
  out: Map<string, LayoutBox>
): void {
  const left = originX + node.getComputedLeft();
  const top = originY + node.getComputedTop();
  const width = node.getComputedWidth();
  const height = node.getComputedHeight();
  out.set(clip.id, { x: left, y: top, width, height });
  const isFlexContainer = clip.mediaType === "group" && clip.layout?.display === "flex";
  if (!isFlexContainer) return;
  const children = childrenByParent.get(clip.id) ?? [];
  children.forEach((child) => {
    const childBuilt = built.get(child.id);
    if (!childBuilt) return;
    collectAbsolutePositions(child, childBuilt.node, left, top, built, childrenByParent, out);
  });
}

/**
 * A clip is a flex root when it is a flex container that no ancestor's flex
 * tree already reaches — i.e. it has no `parentId`, or its parent is not
 * itself a flex container.
 */
function isFlexRoot(clip: TimelineClip, byId: ReadonlyMap<string, TimelineClip>): boolean {
  if (clip.mediaType !== "group" || clip.layout?.display !== "flex") return false;
  if (!clip.parentId) return true;
  const parent = byId.get(clip.parentId);
  return !(parent && parent.mediaType === "group" && parent.layout?.display === "flex");
}

export interface ClipLayoutResolution {
  transforms: Map<string, ClipTransform>;
  sizes: Map<string, { width: number; height: number }>;
  /** Every built clip's Yoga-computed box, canvas-center-relative — the
   * container itself included. Useful where diffing against a clip's own
   * pre-layout box (what `transforms` does) is not what's wanted, such as a
   * validator or a test asserting on a container's own resolved box. */
  resolvedBoxes: Map<string, LayoutBox>;
  cycles: string[];
}

function computeClipLayoutsUncached(
  clips: readonly TimelineClip[],
  canvas: RenderCanvas
): ClipLayoutResolution {
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const childrenByParent = indexChildren(clips);
  const transforms = new Map<string, ClipTransform>();
  const sizes = new Map<string, { width: number; height: number }>();
  const resolvedBoxes = new Map<string, LayoutBox>();
  const allCycles = new Set<string>();

  const roots = clips.filter((clip) => isFlexRoot(clip, byId));
  for (const root of roots) {
    const built = new Map<string, BuiltNode>();
    const visited = new Set<string>();
    const cycles = new Set<string>();
    const rootNode = buildTree(root, canvas, childrenByParent, true, visited, built, cycles);
    for (const id of cycles) allCycles.add(id);

    const rootWidth = root.layout?.width !== undefined ? rootDimensionPx(root.layout.width, canvas.width) : undefined;
    const rootHeight = root.layout?.height !== undefined ? rootDimensionPx(root.layout.height, canvas.height) : undefined;
    rootNode.calculateLayout(rootWidth, rootHeight, Direction.LTR);

    // Every resolved position below is PARENT-LOCAL, not canvas-absolute.
    // `transform.position` is left out of `originX`/`originY` on purpose:
    // the renderer's own `parentMatrix` composition (`resolveGroups`, from
    // the root's own untouched `transform` — the root is a group like any
    // other) already adds it once when it places the root itself, for a
    // pure-translation matrix (no scale/rotation) at *every* point that
    // matrix transforms, not only the root's own quad — so baking it in
    // here too would apply it a second time to every descendant. A root at
    // (0, 0) hid this: the double application added zero.
    //
    // `anchor` stays, though, and for a different reason than `position`:
    // it says which point of the root's *computed flex box* is the one
    // `position` places (AGENTS.md) — a purely local fact about where Yoga's
    // own (top-left) origin sits inside that box, unrelated to how the
    // parent matrix later moves the whole thing. Yoga's own coordinates are
    // top-left-origin; subtracting `anchor.x * rootBoxWidth` re-centers them
    // on the root's own anchor point before `canvas.width / 2` places that
    // point at the frame's own center — the untranslated stand-in `position`
    // will be added to afterward, by the parent matrix, for real.
    const rootBoxWidth = rootNode.getComputedWidth();
    const rootBoxHeight = rootNode.getComputedHeight();
    const rootAnchor = root.transform?.anchor ?? { x: 0.5, y: 0.5 };
    const originX = canvas.width / 2 - rootAnchor.x * rootBoxWidth;
    const originY = canvas.height / 2 - rootAnchor.y * rootBoxHeight;

    const boxes = new Map<string, LayoutBox>();
    collectAbsolutePositions(root, rootNode, originX, originY, built, childrenByParent, boxes);
    for (const [id, box] of boxes) {
      resolvedBoxes.set(id, { x: box.x - canvas.width / 2, y: box.y - canvas.height / 2, width: box.width, height: box.height });
    }

    // Walk every clip this tree touched and turn its target box into a
    // `transform.position` delta against its *current* rendered box — the
    // primitive `moved()` already expresses. The root itself is placed by its
    // own authored `transform` (position + anchor, above) rather than by this
    // diff, so it is excluded here.
    for (const [id, builtNode] of built) {
      if (id === root.id) continue;
      const clip = builtNode.clip;
      const target = boxes.get(id);
      if (!target) continue;
      const isAbsoluteNoInset =
        clip.flexItem?.position === "absolute" && clip.flexItem?.inset === undefined;

      let sizedClip = clip;
      let sizeOverride: { width: number; height: number } | undefined;
      if (!builtNode.isFlexContainer) {
        if (clip.mediaType === "shape" && clip.shapeStyle && clip.shapeStyle.kind !== "path" && canvas.width > 0 && canvas.height > 0) {
          sizeOverride = { width: target.width, height: target.height };
          // `x`/`y` are pinned to the top-left too, not left at whatever the
          // clip authored (or its own default, which `shapeBox` centers at
          // 0.25/0.25 — not the 0/0 this box math assumes): the box we are
          // resizing to is measured from the frame's top-left, via the same
          // `x ?? 0` convention `measuredClipBox`'s shape branch uses above,
          // so the drawn shape has to use that convention too or it renders
          // centered inside its own resized box instead of filling it.
          //
          // Excluded: `"path"`. Its draw code (`buildShapeSegments`) ignores
          // `x`/`y`/`width`/`height` entirely — it scales `d` straight to
          // the full canvas — so writing a resized box into those fields
          // would change nothing about what's drawn while corrupting the
          // *position* diff below (`shapeAuthoredBox`'s real, `d`-derived
          // current box would stop applying, since it only kicks in when
          // width/height are unset). A path's flex-computed size only ever
          // repositions it via the diff; it cannot resize the curve itself.
          sizedClip = { ...clip, shapeStyle: { ...clip.shapeStyle, x: 0, y: 0, width: target.width / canvas.width, height: target.height / canvas.height } };
        } else if (clip.mediaType === "text" && clip.textStyle && canvas.width > 0) {
          sizeOverride = { width: target.width, height: target.height };
          sizedClip = { ...clip, textStyle: { ...clip.textStyle, maxWidthFrac: Math.min(1, Math.max(0.05, target.width / canvas.width)) } };
        }
      }
      if (sizeOverride) sizes.set(id, sizeOverride);

      if (isAbsoluteNoInset) {
        // Keeps its authored position; only a size override (if any) applies.
        if (sizeOverride) transforms.set(id, sizedClip.transform ?? IDENTITY_TRANSFORM);
        continue;
      }

      const currentBox = boxFor(sizedClip, canvas, childrenByParent);
      const currentCenter = { x: currentBox.x + currentBox.width / 2, y: currentBox.y + currentBox.height / 2 };
      const targetCenter = { x: target.x + target.width / 2 - canvas.width / 2, y: target.y + target.height / 2 - canvas.height / 2 };
      const current = sizedClip.transform ?? IDENTITY_TRANSFORM;
      transforms.set(id, moved(
        current,
        current.position.x + targetCenter.x - currentCenter.x,
        current.position.y + targetCenter.y - currentCenter.y
      ));
    }

    // `freeRecursive` walks the tree it was inserted into, so freeing the
    // root frees every child exactly once.
    rootNode.freeRecursive();
  }

  return { transforms, sizes, resolvedBoxes, cycles: [...allCycles] };
}

interface LayoutCacheEntry {
  width: number;
  height: number;
  measureText: RenderCanvas["measureText"];
  result: ClipLayoutResolution;
}

/**
 * Layout is static per clip (AGENTS.md): resolving the same `clips` array
 * against the same canvas size and measurer twice must not rebuild the Yoga
 * tree twice. Every host calls this once per frame (`sceneModel.ts`'s
 * `computeActiveLayers`), and a document's `clips` array is only ever
 * replaced wholesale by an edit (the stores build a new array on every
 * mutation) — never mutated in place — so a `WeakMap` keyed by that array
 * identity, holding one entry good for one canvas size and measurer, is a
 * correct cache: an unchanged document during scrubbing/playback hits it on
 * every frame, and any edit (a new array) or a canvas resize misses it.
 */
const layoutCache = new WeakMap<readonly TimelineClip[], LayoutCacheEntry>();

export function resolveClipLayoutsWithDiagnostics(
  clips: readonly TimelineClip[],
  canvas: RenderCanvas
): ClipLayoutResolution {
  const cached = layoutCache.get(clips);
  if (
    cached &&
    cached.width === canvas.width &&
    cached.height === canvas.height &&
    cached.measureText === canvas.measureText
  ) {
    return cached.result;
  }
  const result = computeClipLayoutsUncached(clips, canvas);
  layoutCache.set(clips, { width: canvas.width, height: canvas.height, measureText: canvas.measureText, result });
  return result;
}

export function resolveClipLayouts(clips: readonly TimelineClip[], canvas: RenderCanvas): Map<string, ClipTransform> {
  return resolveClipLayoutsWithDiagnostics(clips, canvas).transforms;
}

/** Sizes flex resolved for a leaf (rect/ellipse's box, or a text clip's
 * effective wrap width) alongside {@link resolveClipLayouts}'s transforms. */
export function resolveClipLayoutSizes(clips: readonly TimelineClip[], canvas: RenderCanvas): Map<string, { width: number; height: number }> {
  return resolveClipLayoutsWithDiagnostics(clips, canvas).sizes;
}

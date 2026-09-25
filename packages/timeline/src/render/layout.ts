import type { ClipTransform, TimelineClip } from "../types.js";
import { layoutTextBlock, textFontSpec, type RenderCanvas } from "./textLayout.js";
import { IDENTITY_TRANSFORM, buildTransformMatrix, containBaseScale } from "./transform.js";

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
    const shape = clip.shapeStyle;
    const left = (shape.x ?? 0) * canvas.width;
    const top = (shape.y ?? 0) * canvas.height;
    const width = (shape.width ?? 1) * canvas.width;
    const height = (shape.height ?? 1) * canvas.height;
    return projectedBox({ x: left, y: top, width, height }, transform, canvas);
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

/** Resolve rows, stacks, and box-relative placement from the current clip content. */
export function resolveClipLayoutsWithDiagnostics(clips: readonly TimelineClip[], canvas: RenderCanvas): { transforms: Map<string, ClipTransform>; cycles: string[] } {
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const childrenByParent = indexChildren(clips);
  const result = new Map<string, ClipTransform>();
  for (const container of clips) {
    const layout = container.layout;
    if (!layout || layout.kind === "relative" || !layout.children?.length) continue;
    const children = layout.children.map((id) => byId.get(id)).filter((child): child is TimelineClip => child !== undefined);
    const boxes = children.map((child) => boxFor(child, canvas, childrenByParent));
    const gap = layout.gapPx ?? 0;
    const extent = boxes.reduce((sum, box) => sum + (layout.kind === "row" ? box.width : box.height), 0) + Math.max(0, boxes.length - 1) * gap;
    let cursor = -extent / 2;
    const origin = container.transform?.position ?? { x: 0, y: 0 };
    children.forEach((child, index) => {
      const box = boxes[index];
      if (!box) return;
      const center = cursor + (layout.kind === "row" ? box.width : box.height) / 2;
      const oldCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const nextX = layout.kind === "row" ? origin.x + center : origin.x;
      const nextY = layout.kind === "stack" ? origin.y + center : origin.y;
      const current = child.transform ?? IDENTITY_TRANSFORM;
      result.set(child.id, moved(current, current.position.x + nextX - oldCenter.x, current.position.y + nextY - oldCenter.y));
      cursor += (layout.kind === "row" ? box.width : box.height) + gap;
    });
  }

  const relative = clips.filter((clip) => clip.layout?.kind === "relative");
  const relativeIds = new Set(relative.map((clip) => clip.id));
  const dependents = new Map<string, TimelineClip[]>();
  const indegree = new Map(relative.map((clip) => [clip.id, 0]));
  for (const clip of relative) {
    const targetId = clip.layout?.targetClipId;
    if (!targetId || !relativeIds.has(targetId)) continue;
    indegree.set(clip.id, 1);
    const siblings = dependents.get(targetId) ?? [];
    siblings.push(clip);
    dependents.set(targetId, siblings);
  }
  const queue = relative.filter((clip) => indegree.get(clip.id) === 0);
  for (let index = 0; index < queue.length; index++) {
    const clip = queue[index];
    const layout = clip.layout;
    if (!layout || layout.kind !== "relative" || !layout.targetClipId) {
      // A missing target leaves the authored transform in place.
    } else {
      const target = byId.get(layout.targetClipId);
      if (target) {
    const targetTransform = result.get(target.id) ?? target.transform;
    const targetBox = boxFor({ ...target, transform: targetTransform }, canvas, childrenByParent);
    const own = boxFor(clip, canvas, childrenByParent);
    const gap = layout.gapPx ?? 0;
    const side = layout.side ?? "center";
    let centerX = targetBox.x + targetBox.width / 2;
    let centerY = targetBox.y + targetBox.height / 2;
    if (side === "left") centerX = targetBox.x - own.width / 2 - gap;
    if (side === "right") centerX = targetBox.x + targetBox.width + own.width / 2 + gap;
    if (side === "above") centerY = targetBox.y - own.height / 2 - gap;
    if (side === "below") centerY = targetBox.y + targetBox.height + own.height / 2 + gap;
    let scale: { x: number; y: number } | undefined;
    if (layout.fitText && target.mediaType === "text") {
      scale = {
        x: (targetBox.width + 2 * layout.fitText.paddingXPx) / Math.max(1, own.width) * (clip.transform?.scale.x ?? 1),
        y: (targetBox.height + 2 * layout.fitText.paddingYPx) / Math.max(1, own.height) * (clip.transform?.scale.y ?? 1)
      };
    }
    const current = clip.transform ?? IDENTITY_TRANSFORM;
    const sized = scale ? boxFor({ ...clip, transform: moved(current, current.position.x, current.position.y, scale) }, canvas, childrenByParent) : own;
    result.set(clip.id, moved(clip.transform, current.position.x + centerX - (sized.x + sized.width / 2), current.position.y + centerY - (sized.y + sized.height / 2), scale));
      }
    }
    indegree.delete(clip.id);
    for (const dependent of dependents.get(clip.id) ?? []) {
      indegree.set(dependent.id, (indegree.get(dependent.id) ?? 1) - 1);
      if (indegree.get(dependent.id) === 0) queue.push(dependent);
    }
  }
  const examined = new Set<string>();
  const cycleIds = new Set<string>();
  for (const clip of relative) {
    if (!indegree.has(clip.id) || examined.has(clip.id)) continue;
    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let cursor: string | undefined = clip.id;
    while (cursor && indegree.has(cursor) && !examined.has(cursor)) {
      const repeatedAt = pathIndex.get(cursor);
      if (repeatedAt !== undefined) {
        path.slice(repeatedAt).forEach((id) => cycleIds.add(id));
        break;
      }
      pathIndex.set(cursor, path.length);
      path.push(cursor);
      cursor = byId.get(cursor)?.layout?.targetClipId;
    }
    path.forEach((id) => examined.add(id));
  }
  return { transforms: result, cycles: relative.filter((clip) => cycleIds.has(clip.id)).map((clip) => clip.id) };
}

export function resolveClipLayouts(clips: readonly TimelineClip[], canvas: RenderCanvas): Map<string, ClipTransform> {
  return resolveClipLayoutsWithDiagnostics(clips, canvas).transforms;
}

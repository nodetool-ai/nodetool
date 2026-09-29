#!/usr/bin/env node
/**
 * One-off migration for `serein.timeline.json` — the shipped example that has
 * no authoring script to regenerate it from (unlike kite/prism/voltra).
 *
 * The timeline layout resolver moved from a bespoke row/stack/relative model
 * to CSS flexbox (Yoga) with no back-compat (see `packages/timeline/AGENTS.md`
 * and `packages/timeline/src/render/layout.ts`). serein authored 16 clips with
 * the old `layout.kind: "row" | "relative"` shape, which the new zod schema
 * rejects outright (`layout.display` must be `"flex"`).
 *
 * serein's old layouts are one-off placements, not something that needs to
 * stay reflowable, so this bakes each affected clip's OLD resolved position
 * directly into `transform.position` and drops `layout` — the clip renders
 * exactly where the old resolver put it, with no relationship left to encode.
 * This is a pure position bake: it reimplements the deleted row/stack/relative
 * math (not shipped, run once) against the SAME primitives the new resolver
 * still shares (`buildTransformMatrix`, `layoutTextBlock`, `textFontSpec`,
 * `containBaseScale` — unchanged by the flex migration) so the numbers match
 * exactly what used to render.
 *
 * Run once: `node scripts/migrate-serein-layout.mjs`. Not shipped as product
 * code.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildTransformMatrix,
  containBaseScale,
  layoutTextBlock,
  textFontSpec,
  IDENTITY_TRANSFORM
} from "@nodetool-ai/timeline/scene";

const FILE = process.argv[2] ?? "packages/base-nodes/nodetool/examples/timelines/serein.timeline.json";

function projectedBox(box, transform, canvas, base = { x: 1, y: 1 }) {
  const matrix = buildTransformMatrix(transform, base, canvas.width, canvas.height);
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height]
  ];
  const points = corners.map(([x, y]) => {
    const nx = (2 * x) / canvas.width - 1;
    const ny = 1 - (2 * y) / canvas.height;
    const w = matrix[3] * nx + matrix[7] * ny + matrix[15];
    const px = (matrix[0] * nx + matrix[4] * ny + matrix[12]) / w;
    const py = (matrix[1] * nx + matrix[5] * ny + matrix[13]) / w;
    return { x: ((px + 1) * canvas.width) / 2, y: ((1 - py) * canvas.height) / 2 };
  });
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  return {
    x: left - canvas.width / 2,
    y: top - canvas.height / 2,
    width: Math.max(...points.map((p) => p.x)) - left,
    height: Math.max(...points.map((p) => p.y)) - top
  };
}

function measuredClipBox(clip, canvas, childrenByParent, visited) {
  const transform = clip.transform ?? IDENTITY_TRANSFORM;
  if (clip.mediaType === "group") {
    if (visited.has(clip.id)) return { x: 0, y: 0, width: 0, height: 0 };
    visited.add(clip.id);
    const children = childrenByParent.get(clip.id) ?? [];
    const boxes = children
      .map((child) => measuredClipBox(child, canvas, childrenByParent, visited))
      .filter((box) => box.width > 0 && box.height > 0);
    visited.delete(clip.id);
    if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width));
    const y1 = Math.max(...boxes.map((b) => b.y + b.height));
    return projectedBox(
      { x: x0 + canvas.width / 2, y: y0 + canvas.height / 2, width: x1 - x0, height: y1 - y0 },
      transform,
      canvas
    );
  }
  if (clip.mediaType === "text" && clip.textStyle) {
    const style = clip.textStyle;
    const font = textFontSpec(style);
    const measure = (text) => text.length * style.fontSizePx * 0.6; // no canvas, same fallback the renderer uses headless
    void font;
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

function indexChildren(clips) {
  const index = new Map();
  for (const clip of clips) {
    if (!clip.parentId) continue;
    const list = index.get(clip.parentId) ?? [];
    list.push(clip);
    index.set(clip.parentId, list);
  }
  return index;
}

function boxFor(clip, canvas, childrenByParent) {
  return measuredClipBox(clip, canvas, childrenByParent, new Set());
}

function moved(base, x, y, scale) {
  const source = base ?? IDENTITY_TRANSFORM;
  return { ...source, position: { x, y }, scale: scale ?? source.scale };
}

/** The deleted resolver's row/stack/relative pass, reproduced verbatim. */
function resolveOldLayouts(clips, canvas) {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const childrenByParent = indexChildren(clips);
  const result = new Map();

  for (const container of clips) {
    const layout = container.layout;
    if (!layout || layout.kind === "relative" || !layout.children?.length) continue;
    const children = layout.children.map((id) => byId.get(id)).filter(Boolean);
    const boxes = children.map((child) => boxFor(child, canvas, childrenByParent));
    const gap = layout.gapPx ?? 0;
    const extent =
      boxes.reduce((sum, box) => sum + (layout.kind === "row" ? box.width : box.height), 0) +
      Math.max(0, boxes.length - 1) * gap;
    let cursor = -extent / 2;
    const origin = container.transform?.position ?? { x: 0, y: 0 };
    const align = layout.align ?? "center";
    children.forEach((child, index) => {
      const box = boxes[index];
      if (!box) return;
      const ownCross = layout.kind === "row" ? box.height : box.width;
      const crossOffset = align === "start" ? ownCross / 2 : align === "end" ? -ownCross / 2 : 0;
      const center = cursor + (layout.kind === "row" ? box.width : box.height) / 2;
      const oldCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const nextX = layout.kind === "row" ? origin.x + center : origin.x + crossOffset;
      const nextY = layout.kind === "stack" ? origin.y + center : origin.y + crossOffset;
      const current = child.transform ?? IDENTITY_TRANSFORM;
      result.set(
        child.id,
        moved(current, current.position.x + nextX - oldCenter.x, current.position.y + nextY - oldCenter.y)
      );
      cursor += (layout.kind === "row" ? box.width : box.height) + gap;
    });
  }

  const relative = clips.filter((c) => c.layout?.kind === "relative");
  const relativeIds = new Set(relative.map((c) => c.id));
  const dependents = new Map();
  const indegree = new Map(relative.map((c) => [c.id, 0]));
  for (const c of relative) {
    const targetId = c.layout?.targetClipId;
    if (!targetId || !relativeIds.has(targetId)) continue;
    indegree.set(c.id, 1);
    const siblings = dependents.get(targetId) ?? [];
    siblings.push(c);
    dependents.set(targetId, siblings);
  }
  const queue = relative.filter((c) => indegree.get(c.id) === 0);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const layout = c.layout;
    if (layout && layout.kind === "relative" && layout.targetClipId) {
      const target = byId.get(layout.targetClipId);
      if (target) {
        const targetTransform = result.get(target.id) ?? target.transform;
        const targetBox = boxFor({ ...target, transform: targetTransform }, canvas, childrenByParent);
        const own = boxFor(c, canvas, childrenByParent);
        const gap = layout.gapPx ?? 0;
        const side = layout.side ?? "center";
        let centerX = targetBox.x + targetBox.width / 2;
        let centerY = targetBox.y + targetBox.height / 2;
        if (side === "left") centerX = targetBox.x - own.width / 2 - gap;
        if (side === "right") centerX = targetBox.x + targetBox.width + own.width / 2 + gap;
        if (side === "above") centerY = targetBox.y - own.height / 2 - gap;
        if (side === "below") centerY = targetBox.y + targetBox.height + own.height / 2 + gap;
        let scale;
        if (layout.fitText && target.mediaType === "text") {
          scale = {
            x: ((targetBox.width + 2 * layout.fitText.paddingXPx) / Math.max(1, own.width)) * (c.transform?.scale.x ?? 1),
            y: ((targetBox.height + 2 * layout.fitText.paddingYPx) / Math.max(1, own.height)) * (c.transform?.scale.y ?? 1)
          };
        }
        const current = c.transform ?? IDENTITY_TRANSFORM;
        const sized = scale
          ? boxFor({ ...c, transform: moved(current, current.position.x, current.position.y, scale) }, canvas, childrenByParent)
          : own;
        result.set(
          c.id,
          moved(
            c.transform,
            current.position.x + centerX - (sized.x + sized.width / 2),
            current.position.y + centerY - (sized.y + sized.height / 2),
            scale
          )
        );
      }
    }
    indegree.delete(c.id);
    for (const dependent of dependents.get(c.id) ?? []) {
      indegree.set(dependent.id, (indegree.get(dependent.id) ?? 1) - 1);
      if (indegree.get(dependent.id) === 0) queue.push(dependent);
    }
  }
  return result;
}

const source = readFileSync(FILE, "utf8");
const raw = JSON.parse(source);
const doc = raw.document;
const canvas = { width: raw.width, height: raw.height };
const resolved = resolveOldLayouts(doc.clips, canvas);

// `resolved` covers every clip the old algorithm moved — a row/stack's
// children never carried `layout` themselves (only the container listing
// them in `children` did), so this must walk `resolved`, not "every clip
// that has a `layout` field", or a row's children keep their unmoved
// pre-layout position while their container's `layout` still gets dropped.
let repositioned = 0;
for (const [id, transform] of resolved) {
  const clip = doc.clips.find((c) => c.id === id);
  if (clip) {
    clip.transform = transform;
    repositioned += 1;
  }
}
let migrated = 0;
for (const clip of doc.clips) {
  if (!clip.layout) continue;
  delete clip.layout;
  migrated += 1;
}

// Keep the file's own shape (the shipped example is minified, the benchmark
// fixture is indented) so the diff is the semantic change, not a reformat.
const indent = source.includes("\n  ") ? 2 : undefined;
writeFileSync(FILE, JSON.stringify(raw, null, indent) + (indent ? "\n" : ""));
console.log(`Repositioned ${repositioned} clip(s) and dropped \`layout\` off ${migrated} container/relative clip(s) in ${FILE}.`);

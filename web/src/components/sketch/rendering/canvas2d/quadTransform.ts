import type { Point, PerspectiveQuad } from "../../types";

interface Triangle {
  src: [Point, Point, Point];
  dst: [Point, Point, Point];
}

function computeTriangleTransform(
  src: [Point, Point, Point],
  dst: [Point, Point, Point]
): [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;
  const det =
    (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(det) <= 1e-6) {
    return null;
  }
  const a =
    ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det;
  const b =
    ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det;
  const c =
    ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det;
  const d =
    ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

function drawImageTriangle(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  triangle: Triangle
): void {
  const transform = computeTriangleTransform(triangle.src, triangle.dst);
  if (!transform) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(triangle.dst[0].x, triangle.dst[0].y);
  ctx.lineTo(triangle.dst[1].x, triangle.dst[1].y);
  ctx.lineTo(triangle.dst[2].x, triangle.dst[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(...transform);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

export function getQuadExtents(quad: PerspectiveQuad): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

export function translateQuad(
  quad: PerspectiveQuad,
  dx: number,
  dy: number
): PerspectiveQuad {
  return quad.map((point) => ({
    x: point.x + dx,
    y: point.y + dy
  })) as PerspectiveQuad;
}

export function drawImageToQuad(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  quad: PerspectiveQuad
): void {
  const srcQuad: PerspectiveQuad = [
    { x: 0, y: 0 },
    { x: source.width, y: 0 },
    { x: source.width, y: source.height },
    { x: 0, y: source.height }
  ];
  drawImageTriangle(ctx, source, {
    src: [srcQuad[0], srcQuad[1], srcQuad[2]],
    dst: [quad[0], quad[1], quad[2]]
  });
  drawImageTriangle(ctx, source, {
    src: [srcQuad[0], srcQuad[2], srcQuad[3]],
    dst: [quad[0], quad[2], quad[3]]
  });
}

/**
 * Render a source image into TWO independent quads (the dual-plane
 * perspective). The source is split vertically at `splitX` (in source
 * pixels). The left half maps to `quadA`, the right half maps to `quadB`.
 *
 * Shared fold edge convention: `quadA[1]` (top-right) and `quadA[2]`
 * (bottom-right) are the same points as `quadB[0]` (top-left) and
 * `quadB[3]` (bottom-left). The caller is responsible for keeping that
 * invariant; the renderer just maps each half independently.
 */
export function drawImageToDualQuad(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  quadA: PerspectiveQuad,
  quadB: PerspectiveQuad,
  splitX: number = source.width / 2
): void {
  const sx = Math.max(0, Math.min(source.width, splitX));
  // Left half source quad → quadA.
  const leftSrc: PerspectiveQuad = [
    { x: 0, y: 0 },
    { x: sx, y: 0 },
    { x: sx, y: source.height },
    { x: 0, y: source.height }
  ];
  // Right half source quad → quadB.
  const rightSrc: PerspectiveQuad = [
    { x: sx, y: 0 },
    { x: source.width, y: 0 },
    { x: source.width, y: source.height },
    { x: sx, y: source.height }
  ];
  drawImageTriangle(ctx, source, {
    src: [leftSrc[0], leftSrc[1], leftSrc[2]],
    dst: [quadA[0], quadA[1], quadA[2]]
  });
  drawImageTriangle(ctx, source, {
    src: [leftSrc[0], leftSrc[2], leftSrc[3]],
    dst: [quadA[0], quadA[2], quadA[3]]
  });
  drawImageTriangle(ctx, source, {
    src: [rightSrc[0], rightSrc[1], rightSrc[2]],
    dst: [quadB[0], quadB[1], quadB[2]]
  });
  drawImageTriangle(ctx, source, {
    src: [rightSrc[0], rightSrc[2], rightSrc[3]],
    dst: [quadB[0], quadB[2], quadB[3]]
  });
}

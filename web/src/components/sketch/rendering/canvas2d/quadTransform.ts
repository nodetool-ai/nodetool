import type { Quad } from "../../types";

type PerspectiveQuad = Quad;

export function getQuadExtents(quad: PerspectiveQuad) {
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
  return [
    { x: quad[0].x + dx, y: quad[0].y + dy },
    { x: quad[1].x + dx, y: quad[1].y + dy },
    { x: quad[2].x + dx, y: quad[2].y + dy },
    { x: quad[3].x + dx, y: quad[3].y + dy }
  ] as const;
}

/** Shared with the headless renderer, so a warped layer lands on the same pixels. */
export { drawImageToQuad } from "@nodetool-ai/image-editor/render.js";

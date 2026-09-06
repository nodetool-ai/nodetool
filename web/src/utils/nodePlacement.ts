import type { XYPosition } from "@xyflow/react";

export type PlacementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Flow-space gap between an output handle and the left edge of the node created from it. */
export const HANDLE_GAP_X = 60;

/**
 * Where a node's first input handle sits below its top edge, before the node
 * has mounted and can be measured. Nodes vary from ~10px (Reroute) to ~100px
 * (a node with a long header), so this is only the pre-mount guess —
 * `alignNodeToAnchor` corrects it against the real handle once it renders.
 */
export const ESTIMATED_INPUT_HANDLE_OFFSET_Y = 24;

/** Vertical clearance kept between a placed node and the nodes already there. */
export const OVERLAP_MARGIN = 20;

/**
 * Position a node so its first input handle lands `gapX` to the right of
 * `anchor` and level with it — the incoming edge comes out horizontal.
 */
export const placeAtAnchor = (
  anchor: XYPosition,
  inputHandleOffsetY: number,
  gapX: number = HANDLE_GAP_X
): XYPosition => ({
  x: anchor.x + gapX,
  y: anchor.y - inputHandleOffsetY
});

const intersects = (
  a: PlacementRect,
  b: PlacementRect,
  margin: number
): boolean =>
  a.x < b.x + b.width + margin &&
  a.x + a.width + margin > b.x &&
  a.y < b.y + b.height + margin &&
  a.y + a.height + margin > b.y;

/**
 * Move `rect` vertically to the nearest spot that clears every rect in
 * `others`.
 *
 * Without this, two nodes created from the same handle land on exactly the
 * same coordinates, and a node created from a handle that already has a
 * downstream node lands on top of it. Candidates are the desired position
 * plus the free edge below and above each obstacle; the one closest to the
 * desired position wins, so the node stays near the handle it came from, and
 * a tie goes downward — the direction a graph grows.
 */
export const resolveVerticalOverlap = (
  rect: PlacementRect,
  others: PlacementRect[],
  margin: number = OVERLAP_MARGIN
): number => {
  const clear = (y: number): boolean =>
    others.every((other) => !intersects({ ...rect, y }, other, margin));
  if (clear(rect.y)) {
    return rect.y;
  }
  const candidates = [
    ...others.map((other) => other.y + other.height + margin),
    ...others.map((other) => other.y - rect.height - margin)
  ];
  let best: number | null = null;
  for (const candidate of candidates) {
    if (!clear(candidate)) {
      continue;
    }
    if (
      best === null ||
      Math.abs(candidate - rect.y) < Math.abs(best - rect.y)
    ) {
      best = candidate;
    }
  }
  return best ?? rect.y;
};

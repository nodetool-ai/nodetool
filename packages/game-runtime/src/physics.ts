import type { GameEntity } from "@nodetool-ai/protocol";

/** An axis-aligned box by center and half extents, in world units. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface SweepHit {
  readonly time: number;
  readonly normalX: number;
  readonly normalY: number;
}

/** Face bits of a box. A hit normal names the face of the obstacle that was struck. */
export const FACE_LEFT = 1;
export const FACE_RIGHT = 2;
export const FACE_BOTTOM = 4;
export const FACE_TOP = 8;

export function faceOf(hit: SweepHit): number {
  if (hit.normalX < 0) return FACE_LEFT;
  if (hit.normalX > 0) return FACE_RIGHT;
  if (hit.normalY < 0) return FACE_BOTTOM;
  return hit.normalY > 0 ? FACE_TOP : 0;
}

/**
 * Sweep the moving box through one displacement against a stationary box. When the boxes already
 * overlap, a solid pair reports a hit only if the displacement points into the other box.
 */
export function sweepBox(moving: Box, other: Box, dx: number, dy: number, sensor: boolean): SweepHit | undefined {
  const halfX = moving.halfWidth + other.halfWidth;
  const halfY = moving.halfHeight + other.halfHeight;
  const offsetX = other.x - moving.x;
  const offsetY = other.y - moving.y;
  if (Math.abs(offsetX) < halfX && Math.abs(offsetY) < halfY) {
    const useX = halfX - Math.abs(offsetX) <= halfY - Math.abs(offsetY);
    const normalX = useX ? Math.sign(-offsetX) || -Math.sign(dx) : 0;
    const normalY = useX ? 0 : Math.sign(-offsetY) || -Math.sign(dy);
    if (dx * normalX + dy * normalY >= 0 && !sensor) {
      return undefined;
    }
    return { time: 0, normalX, normalY };
  }
  const xEntry = dx > 0 ? (offsetX - halfX) / dx : dx < 0 ? (offsetX + halfX) / dx : -Infinity;
  const xExit = dx > 0 ? (offsetX + halfX) / dx : dx < 0 ? (offsetX - halfX) / dx : Infinity;
  const yEntry = dy > 0 ? (offsetY - halfY) / dy : dy < 0 ? (offsetY + halfY) / dy : -Infinity;
  const yExit = dy > 0 ? (offsetY + halfY) / dy : dy < 0 ? (offsetY - halfY) / dy : Infinity;
  if (dx === 0 && Math.abs(offsetX) >= halfX || dy === 0 && Math.abs(offsetY) >= halfY) {
    return undefined;
  }
  const entry = Math.max(xEntry, yEntry);
  if (entry > Math.min(xExit, yExit) || entry < 0 || entry > 1) {
    return undefined;
  }
  return xEntry >= yEntry
    ? { time: entry, normalX: -Math.sign(dx), normalY: 0 }
    : { time: entry, normalX: 0, normalY: -Math.sign(dy) };
}

type Tilemap = NonNullable<GameEntity["tilemap"]>;

/** A solid tile in tilemap-local coordinates. `internal` marks faces shared with a neighboring solid tile. */
export interface TileBox extends Box {
  readonly oneWay: boolean;
  readonly internal: number;
}

interface TileCollision {
  readonly boxes: readonly TileBox[];
  readonly cells: ReadonlyMap<number, readonly number[]>;
  readonly cellSize: number;
}

const EDGE_EPSILON = 1e-6;
const tileCache = new WeakMap<Tilemap, TileCollision>();

function cellKey(column: number, row: number): number {
  // Levels stay far below 2^20 cells on either axis, so the pair packs into one safe integer.
  return (column + 0x80000) * 0x100000 + (row + 0x80000);
}

function covers(outerLow: number, outerHigh: number, innerLow: number, innerHigh: number): boolean {
  return outerLow <= innerLow + EDGE_EPSILON && outerHigh >= innerHigh - EDGE_EPSILON;
}

/**
 * Solid tiles and a uniform grid over them, built once per tilemap definition. Faces shared with a
 * neighbor are internal, so a body sliding along a row of tiles never catches on the seams.
 */
export function tileCollision(tilemap: Tilemap): TileCollision {
  const cached = tileCache.get(tilemap);
  if (cached) return cached;
  const solid = tilemap.tiles.filter((tile) => tile.solid ?? tilemap.solid ?? false);
  const cellSize = Math.max(0.5, ...solid.map((tile) => Math.max(tile.width, tile.height)));
  const cells = new Map<number, number[]>();
  const range = (low: number, high: number): [number, number] => [Math.floor(low / cellSize), Math.floor(high / cellSize)];
  solid.forEach((tile, index) => {
    const [firstColumn, lastColumn] = range(tile.x - tile.width / 2, tile.x + tile.width / 2);
    const [firstRow, lastRow] = range(tile.y - tile.height / 2, tile.y + tile.height / 2);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        const key = cellKey(column, row);
        const bucket = cells.get(key);
        if (bucket) bucket.push(index);
        else cells.set(key, [index]);
      }
    }
  });
  const neighbors = (tile: (typeof solid)[number]): Set<number> => {
    const found = new Set<number>();
    const [firstColumn, lastColumn] = range(tile.x - tile.width / 2 - EDGE_EPSILON, tile.x + tile.width / 2 + EDGE_EPSILON);
    const [firstRow, lastRow] = range(tile.y - tile.height / 2 - EDGE_EPSILON, tile.y + tile.height / 2 + EDGE_EPSILON);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (const index of cells.get(cellKey(column, row)) ?? []) found.add(index);
      }
    }
    return found;
  };
  const boxes = solid.map((tile, index): TileBox => {
    const oneWay = tile.oneWay ?? false;
    const left = tile.x - tile.width / 2;
    const right = tile.x + tile.width / 2;
    const bottom = tile.y - tile.height / 2;
    const top = tile.y + tile.height / 2;
    let internal = 0;
    if (!oneWay) {
      for (const otherIndex of neighbors(tile)) {
        const other = solid[otherIndex];
        if (otherIndex === index || !other || (other.oneWay ?? false)) continue;
        const otherLeft = other.x - other.width / 2;
        const otherRight = other.x + other.width / 2;
        const otherBottom = other.y - other.height / 2;
        const otherTop = other.y + other.height / 2;
        const spansY = covers(otherBottom, otherTop, bottom, top);
        const spansX = covers(otherLeft, otherRight, left, right);
        if (spansY && Math.abs(otherLeft - right) <= EDGE_EPSILON) internal |= FACE_RIGHT;
        if (spansY && Math.abs(otherRight - left) <= EDGE_EPSILON) internal |= FACE_LEFT;
        if (spansX && Math.abs(otherBottom - top) <= EDGE_EPSILON) internal |= FACE_TOP;
        if (spansX && Math.abs(otherTop - bottom) <= EDGE_EPSILON) internal |= FACE_BOTTOM;
      }
    }
    return { x: tile.x, y: tile.y, halfWidth: tile.width / 2, halfHeight: tile.height / 2, oneWay, internal };
  });
  const collision = { boxes, cells, cellSize };
  tileCache.set(tilemap, collision);
  return collision;
}

/** Solid tiles whose cells intersect a local-space rectangle, each listed once, in tile order. */
export function queryTiles(collision: TileCollision, minX: number, minY: number, maxX: number, maxY: number): TileBox[] {
  if (collision.boxes.length === 0) return [];
  const size = collision.cellSize;
  const firstColumn = Math.floor(minX / size);
  const lastColumn = Math.floor(maxX / size);
  const firstRow = Math.floor(minY / size);
  const lastRow = Math.floor(maxY / size);
  if ((lastColumn - firstColumn + 1) * (lastRow - firstRow + 1) > collision.boxes.length) {
    return collision.boxes.filter((box) => box.x + box.halfWidth >= minX && box.x - box.halfWidth <= maxX &&
      box.y + box.halfHeight >= minY && box.y - box.halfHeight <= maxY);
  }
  const indexes = new Set<number>();
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (const index of collision.cells.get(cellKey(column, row)) ?? []) indexes.add(index);
    }
  }
  return [...indexes].sort((a, b) => a - b).map((index) => collision.boxes[index]!);
}

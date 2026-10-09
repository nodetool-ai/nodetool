import { describe, expect, it } from "vitest";
import { canCollide, canCollideObstacle } from "../src/systems/collision2d.js";
import type { EntityState, Obstacle } from "../src/systems/state2d.js";

interface Filter { category?: number; mask?: number }

function entity(filter: Filter | undefined, active = true): EntityState {
  return { active, definition: { collider2d: filter && { width: 1, height: 1, ...filter } } } as unknown as EntityState;
}

function obstacle(owner: EntityState, filter: Filter): Obstacle {
  return { owner, category: filter.category ?? 1, mask: filter.mask ?? 0xffffffff } as unknown as Obstacle;
}

const ALL = 0xffffffff;
const HIGH = 0x80000000;

describe("collision layer filtering", () => {
  const cases: Array<[string, Filter, Filter, boolean]> = [
    ["defaults collide", {}, {}, true],
    ["both directions match", { category: 2, mask: 4 }, { category: 4, mask: 2 }, true],
    ["a mask misses b category", { category: 2, mask: 8 }, { category: 4, mask: 2 }, false],
    ["b mask misses a category", { category: 2, mask: 4 }, { category: 4, mask: 8 }, false],
    ["zero mask collides with nothing", { mask: 0 }, {}, false],
    ["zero category is hit by nothing", {}, { category: 0 }, false],
    ["bit 31 matches", { category: HIGH, mask: HIGH }, { category: HIGH, mask: HIGH }, true],
    ["bit 31 against all-ones mask", { category: HIGH }, { mask: ALL, category: HIGH }, true],
    ["bit 31 misses bit 0", { category: HIGH, mask: HIGH }, { category: 1, mask: ALL }, false],
    ["max uint32 matches any bit", { category: ALL, mask: ALL }, { category: 0x10, mask: 0x10 }, true]
  ];

  it.each(cases)("canCollide: %s", (_name, a, b, expected) => {
    expect(canCollide(entity(a), entity(b))).toBe(expected);
    expect(canCollide(entity(b), entity(a))).toBe(expected);
  });

  it("canCollide requires both colliders and both active", () => {
    expect(canCollide(entity(undefined), entity({}))).toBe(false);
    expect(canCollide(entity({}), entity(undefined))).toBe(false);
    expect(canCollide(entity({}, false), entity({}))).toBe(false);
    expect(canCollide(entity({}), entity({}, false))).toBe(false);
  });

  it.each(cases)("canCollideObstacle: %s", (_name, a, b, expected) => {
    const state = entity(a);
    expect(canCollideObstacle(state, obstacle(entity(b), b))).toBe(expected);
  });

  it("canCollideObstacle rejects self, inactive owners, and colliderless bodies", () => {
    const state = entity({});
    expect(canCollideObstacle(state, obstacle(state, {}))).toBe(false);
    expect(canCollideObstacle(state, obstacle(entity({}, false), {}))).toBe(false);
    expect(canCollideObstacle(entity(undefined), obstacle(entity({}), {}))).toBe(false);
  });
});

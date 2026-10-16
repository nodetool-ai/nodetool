import { describe, expect, it } from "vitest";
import { gameBehavior } from "../src/game.js";
import { gameEntity3D } from "../src/game3d.js";

describe("authored game script CPU limit", () => {
  it.each([1, 8, 20])("accepts the supported %i ms limit in both dimensions", (maxTickMs) => {
    const behavior = { kind: "script", source: "input => ({state:input.state,commands:[]})", maxTickMs };
    expect(gameBehavior.safeParse(behavior).success).toBe(true);
    expect(gameEntity3D.safeParse({ id: "actor", transform3d: {}, behaviors: [behavior] }).success).toBe(true);
  });
  it.each([21, 30, 50])("rejects an authored %i ms limit in both dimensions", (maxTickMs) => {
    const behavior = { kind: "script", source: "input => ({state:input.state,commands:[]})", maxTickMs };
    expect(gameBehavior.safeParse(behavior).success).toBe(false);
    expect(gameEntity3D.safeParse({ id: "actor", transform3d: {}, behaviors: [behavior] }).success).toBe(false);
  });
});

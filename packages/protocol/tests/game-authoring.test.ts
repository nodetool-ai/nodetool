import { describe, expect, it } from "vitest";
import { gameAuthoring, gameAuthoringOverride, gameAuthoringProgram, gameAuthoringParameter } from "../src/game-authoring.js";

describe("game authoring metadata", () => {
  it("validates explicit program inputs and seeds", () => {
    expect(gameAuthoringProgram.parse({ source: "return game;", inputs: { speed: 2, points: [1, 2] }, seed: 1 }).seed).toBe(1);
    expect(gameAuthoringProgram.safeParse({ source: "", inputs: {}, seed: -1 }).success).toBe(false);
    expect(gameAuthoringProgram.safeParse({ source: "code", inputs: {}, seed: 0, tools: true }).success).toBe(false);
  });
  it("rejects parameter defaults outside declared bounds or enum values", () => {
    expect(gameAuthoringParameter.safeParse({ type: "number", default: 3, min: 5 }).success).toBe(false);
    expect(gameAuthoringParameter.safeParse({ type: "enum", default: "easy", values: ["hard"] }).success).toBe(false);
    expect(gameAuthoringParameter.parse({ type: "vector2", default: [1, 2] }).type).toBe("vector2");
  });
  it("allows nested dictionary keys named id while protecting entity identity", () => {
    expect(gameAuthoringOverride.safeParse({ sceneId: "scene", entityId: "item", path: ["animator", "clips", "id", "ticksPerFrame"], value: 3 }).success).toBe(true);
    expect(gameAuthoringOverride.safeParse({ sceneId: "scene", entityId: "item", path: ["id", "anything"], value: 3 }).success).toBe(false);
    expect(gameAuthoringOverride.safeParse({ sceneId: "scene", entityId: "item", path: ["animator", "constructor", "id"], value: 3 }).success).toBe(false);
  });
  it("rejects unsafe property paths and unsupported versions", () => {
    for (const path of [["__proto__"], ["id"], ["constructor", "prototype"]]) {
      expect(gameAuthoringOverride.safeParse({ sceneId: "scene", entityId: "item", path, value: 3 }).success).toBe(false);
    }
    expect(gameAuthoring.safeParse({ version: 2, program: { source: "code", inputs: {}, seed: 0 }, baseline: {} }).success).toBe(false);
  });
});

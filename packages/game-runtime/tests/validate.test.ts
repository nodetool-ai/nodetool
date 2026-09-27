import { describe, expect, it } from "vitest";
import { validateGame } from "../src/validate.js";

function document(entity: Record<string, unknown>, assets: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, engineVersion: "1", id: "validation", revision: "r1",
    entrySceneId: "main", pixelsPerUnit: 32, tickRate: 60,
    inputActions: ["left", "right", "up", "down"], assets,
    scenes: [{ id: "main", name: "Main", entities: [{ id: "actor", transform2d: { x: 0, y: 0 }, ...entity }] }]
  };
}

const image = { assetId: "builtin:image", digest: "builtin:image-v1", width: 16, height: 16, mediaKind: "image" };
const movement = { kind: "movement", speed: 3, left: "left", right: "right", up: "up", down: "down" };

describe("game validation boundaries", () => {
  it.each([
    ["body2d", { type: "kinematic", gravity: 9.8 }],
    ["transform2d", { x: 0, y: 0, z: 1 }],
    ["collider2d", { width: 1, height: 1, radius: 2 }],
    ["camera2d", { width: 16, height: 9, follow: "actor" }],
    ["behaviors", [{ ...movement, acceleration: 5 }]]
  ])("rejects unsupported fields inside %s", (component, value) => {
    const result = validateGame(document({ [component]: value }));
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(`scenes.0.entities.0.${component}`);
    expect(result.errors.join("\n")).toContain("Unrecognized key");
  });

  it("rejects unknown fields in nested sprite frames", () => {
    const result = validateGame(document({ sprite: { assetId: "image", width: 1, height: 1,
      frame: { x: 0, y: 0, width: 16, height: 16, flipX: true } } }, { image }));
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("scenes.0.entities.0.sprite.frame");
  });

  it.each([
    ["sprite", { assetId: "asset", width: 1, height: 1 }, "audio", "image"],
    ["tilemap", { assetId: "asset", tiles: [] }, "audio", "image"],
    ["audioSource", { assetId: "asset", onEvent: "shoot" }, "image", "audio"]
  ])("rejects the wrong media kind for %s", (component, value, mediaKind, expected) => {
    const result = validateGame(document({ [component]: value }, { asset: { ...image, mediaKind } }));
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain(`scenes.0.entities.0.${component}.assetId`);
    expect(result.errors.join("\n")).toContain(`requires ${expected}`);
  });

  it.each([movement, { kind: "patrol", axis: "x", speed: 1, distance: 2 }])(
    "rejects $kind without a kinematic body", (behavior) => {
      const result = validateGame(document({ behaviors: [behavior] }));
      expect(result.valid).toBe(false);
      expect(result.errors.join("\n")).toContain("scenes.0.entities.0.behaviors.0");
      expect(result.errors.join("\n")).toContain("requires a kinematic body2d");
    }
  );

  it("rejects an animator without a sprite", () => {
    const result = validateGame(document({ animator: { frames: [{ x: 0, y: 0, width: 1, height: 1 }], ticksPerFrame: 2 } }));
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("scenes.0.entities.0.animator: requires a sprite");
  });

  it("accepts supported components and matching media", () => {
    const result = validateGame(document({ body2d: { type: "kinematic" }, behaviors: [movement],
      sprite: { assetId: "image", width: 1, height: 1 }, audioSource: { assetId: "sound", onEvent: "shoot" } },
    { image, sound: { ...image, mediaKind: "audio" } }));
    expect(result.valid).toBe(true);
  });

  it("counts script source limits in UTF-8 bytes", () => {
    const game = document({});
    game.scenes[0].entities = Array.from({ length: 5 }, (_, index) => ({
      id: `actor-${index}`, transform2d: { x: 0, y: 0 },
      behaviors: [{ kind: "script", source: `() => ({state: '${"界".repeat(5000)}', commands: []})` }]
    }));
    expect(validateGame(game).errors).toContain("Game script source exceeds 64 KiB");
  });
});

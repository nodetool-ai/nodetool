import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createTopDownRoomGame } from "../src/index.js";

const boundFrame = { x: 32, y: 0, width: 32, height: 32 };
const componentFrame = { x: 0, y: 0, width: 16, height: 16 };

function game() {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, schemaVersion: 2,
    assets: { ...base.assets, gem: { ...base.assets.gem, width: 64, height: 32, frame: boundFrame } },
    scenes: [{ ...base.scenes[0], entities: [
      { id: "bound-sprite", name: "Bound sprite", transform2d: { x: 0, y: 0 }, sprite: { assetId: "gem", width: 1, height: 1 } },
      { id: "explicit-sprite", name: "Explicit sprite", transform2d: { x: 1, y: 0 }, sprite: { assetId: "gem", width: 1, height: 1, frame: componentFrame } },
      { id: "animated-sprite", name: "Animated sprite", transform2d: { x: 2, y: 0 }, sprite: { assetId: "gem", width: 1, height: 1 },
        animator: { frames: [componentFrame], ticksPerFrame: 1 } },
      { id: "tiles", name: "Tiles", transform2d: { x: 0, y: -1 }, tilemap: { assetId: "gem", tiles: [
        { x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 1, height: 1, frame: componentFrame }
      ] } },
      { id: "camera", name: "Camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 8, height: 8, zoom: 1 } }
    ] }] });
}

describe("game asset frame bindings", () => {
  it("uses a binding's atlas rectangle for sprites and tiles without component frames", () => {
    const session = createGameSession(game(), 0);
    try {
      const frame = session.frame();
      expect(frame.sprites.find((sprite) => sprite.entityId === "bound-sprite")?.frame).toEqual(boundFrame);
      expect(frame.tiles[0].frame).toEqual(boundFrame);
    } finally {
      session.dispose();
    }
  });

  it("lets sprite, animation and tile component rectangles override the binding", () => {
    const session = createGameSession(game(), 0);
    try {
      const frame = session.frame();
      expect(frame.sprites.find((sprite) => sprite.entityId === "explicit-sprite")?.frame).toEqual(componentFrame);
      expect(frame.sprites.find((sprite) => sprite.entityId === "animated-sprite")?.frame).toEqual(componentFrame);
      expect(frame.tiles[1].frame).toEqual(componentFrame);
    } finally {
      session.dispose();
    }
  });

  it("anchors a framed pose to its local foot pivot without scaling it to the atlas", () => {
    const document = game();
    document.assets.gem.pivot = { x: 0.25, y: 1 };
    const session = createGameSession(document, 0);
    try {
      const frame = session.frame();
      expect(frame.sprites.find((sprite) => sprite.entityId === "bound-sprite")).toMatchObject({
        x: 0.25, y: 0.5, previousX: 0.25, previousY: 0.5, width: 1, height: 1, frame: boundFrame
      });
      expect(frame.sprites.find((sprite) => sprite.entityId === "animated-sprite")).toMatchObject({
        x: 2.25, y: 0.5, width: 1, height: 1, frame: componentFrame
      });
    } finally {
      session.dispose();
    }
  });
});

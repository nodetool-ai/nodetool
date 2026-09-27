import { describe, expect, it } from "@jest/globals";
import type { GameRenderFrame } from "@nodetool-ai/protocol/game.js";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { hitEntityIcons, hitSprite, hitSprites, spriteHandle, spriteRotationAt, spriteScaleAt, worldPoint } from "../viewportGeometry";

function frame(zoom: number): GameRenderFrame {
  return {
    tick: 0, width: 16, height: 9, pixelsPerUnit: 32,
    camera: { x: 0, y: 0, zoom }, backgrounds: [], tiles: [], hud: [],
    sprites: [
      { entityId: "behind", assetId: "sprite", x: 1, y: 2, previousX: 1, previousY: 2,
        rotation: Math.PI / 4, scaleX: 1, scaleY: 1, width: 2, height: 0.5, layer: 1 },
      { entityId: "front", assetId: "sprite", x: 1, y: 2, previousX: 1, previousY: 2,
        rotation: Math.PI / 4, scaleX: 1, scaleY: 1, width: 2, height: 0.5, layer: 2 }
    ]
  };
}

describe("native game viewport picking", () => {
  it.each([0.25, 4])("picks the top rotated sprite at zoom %s", (zoom) => {
    const current = frame(zoom);
    const x = 1 + 0.5 * Math.cos(Math.PI / 4);
    const y = 2 + 0.5 * Math.sin(Math.PI / 4);
    const pixelX = 256 + x * zoom * 32;
    const pixelY = 144 - y * zoom * 32;
    const point = worldPoint(pixelX, pixelY, current, 512, 288);
    expect(hitSprite(current, point.x, point.y)?.entityId).toBe("front");
    expect(hitSprites(current, point.x, point.y).map((sprite) => sprite.entityId)).toEqual(["front", "behind"]);
    expect(hitSprite(current, 1.9, 2)).toBeNull();
  });

  it("orders stacked non-sprite icons for Alt cycling", () => {
    const scene = createTopDownRoomGame("icon-pick").scenes[0];
    scene.entities = scene.entities.slice(0, 2);
    scene.entities[0].sprite = undefined;
    scene.entities[1].sprite = undefined;
    scene.entities[0].transform2d.x = 0;
    scene.entities[0].transform2d.y = 0;
    scene.entities[1].transform2d.x = 0;
    scene.entities[1].transform2d.y = 0;
    expect(hitEntityIcons(scene, { ...frame(1), sprites: [] }, 0, 0).map((entity) => entity.id))
      .toEqual([scene.entities[1].id, scene.entities[0].id]);
  });
});

describe("native game transform handles", () => {
  it("scales from the rotated corner and keeps aspect ratio with Shift", () => {
    const sprite = frame(1).sprites[0];
    const corner = spriteHandle(sprite, "scale");
    const dragged = { x: sprite.x + (corner.x - sprite.x) * 2,
      y: sprite.y + (corner.y - sprite.y) * 2 };
    const result = spriteScaleAt(sprite, dragged.x, dragged.y, true);
    expect(result.scaleX).toBeCloseTo(2);
    expect(result.scaleY).toBeCloseTo(2);
  });

  it("snaps rotation to fifteen degree steps with Shift", () => {
    const sprite = frame(1).sprites[0];
    const angle = Math.PI / 6 + Math.PI / 2;
    const result = spriteRotationAt(sprite, sprite.x + Math.cos(angle), sprite.y + Math.sin(angle), true);
    expect(result).toBeCloseTo(Math.PI / 6);
  });
});

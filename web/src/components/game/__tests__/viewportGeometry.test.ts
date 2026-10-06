import { describe, expect, it } from "@jest/globals";
import type { GameRenderFrame } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { parentCandidates, worldTransforms, localTransform, selectionRoots, reparentTransform, hitEntityIcons, hitSprite, hitSprites, spriteHandle, spriteRotationAt, spriteScaleAt, worldPoint } from "../viewportGeometry";

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

describe("parent-local editor transforms", () => {
  function scene() {
    const result = createTopDownRoomGame("children").scenes[0];
    result.entities = result.entities.slice(0, 3);
    const [parent, child, sibling] = result.entities;
    parent.transform2d = { x: 5, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    child.parentId = parent.id;
    child.transform2d = { x: 2, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    sibling.parentId = undefined;
    return result;
  }
  it("picks child icons at world x=7 and converts a drag back to local x=3", () => {
    const current = scene();
    expect(hitEntityIcons(current, { ...frame(1), sprites: [] }, 7, 0).map(entity => entity.id)).toContain(current.entities[1].id);
    const transforms = worldTransforms(current);
    const world = transforms.get(current.entities[1].id)!;
    expect(world.x).toBe(7);
    expect(localTransform(current, current.entities[0].id, { ...world, x: 8 }).x).toBe(3);
  });
  it("preserves translation rotation and scale when reparenting", () => {
    const current = scene();
    current.entities[0].transform2d = { x: 5, y: 3, rotation: Math.PI / 2, scaleX: 2, scaleY: 3 };
    expect(reparentTransform(current, current.entities[1].id, undefined)).toEqual(worldTransforms(current).get(current.entities[1].id));
    const world = worldTransforms(current).get(current.entities[1].id)!;
    const local = localTransform(current, current.entities[0].id, world);
    expect(local.x).toBeCloseTo(2);
    expect(local.y).toBeCloseTo(0);
    expect(local.rotation).toBe(0);
    expect(local.scaleX).toBe(1);
  });
  it("converts world gizmo scale and rotation into parent-local values", () => {
    const current = scene();
    const parent = current.entities[0];
    parent.transform2d.rotation = Math.PI / 2;
    parent.transform2d.scaleX = 2;
    parent.transform2d.scaleY = 3;
    const child = current.entities[1];
    const world = worldTransforms(current).get(child.id)!;
    const result = localTransform(current, child.parentId, { ...world, rotation: Math.PI, scaleX: 6, scaleY: 12 });
    expect(result.rotation).toBeCloseTo(Math.PI / 2);
    expect(result.scaleX).toBe(3);
    expect(result.scaleY).toBe(4);
  });
  it("removes descendants from a multi-delete or movement selection", () => {
    const current = scene();
    expect(selectionRoots(current, current.entities.map(entity => entity.id)).map(entity => entity.id)).toEqual([current.entities[0].id, current.entities[2].id]);
  });
});

it("multi-deletes a parent and child through a valid operation list", () => {
  const document = createTopDownRoomGame("delete");
  const scene = document.scenes[0];
  const [parent, child] = scene.entities;
  child.parentId = parent.id;
  const ops = selectionRoots(scene, [parent.id, child.id]).map(entity => ({
    op: "remove_entity" as const, scene_id: scene.id, entity_id: entity.id, children: "remove" as const
  }));
  const result = applyGameOps(document, ops);
  expect(result.scenes[0].entities.some(entity => entity.id === parent.id || entity.id === child.id)).toBe(false);
});

it("resolves a deep hierarchy and excludes all descendants from parent choices", () => {
  const scene = createTopDownRoomGame("deep").scenes[0];
  const prototype = scene.entities[0];
  scene.entities = Array.from({ length: 4096 }, (_, index) => ({ ...prototype, id: `entity-${index}`,
    parentId: index ? `entity-${index - 1}` : undefined,
    transform2d: { x: 1, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }));
  expect(worldTransforms(scene).get("entity-4095")?.x).toBe(4096);
  expect(selectionRoots(scene, scene.entities.map(entity => entity.id)).map(entity => entity.id)).toEqual(["entity-0"]);
  expect(parentCandidates(scene, "entity-0")).toEqual([]);
});

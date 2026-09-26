import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";

/** Playable asset-free room used by native game creation and headless checks. */
export function createTopDownRoomGame(id: string): GameDocument {
  return gameDocument.parse({
    schemaVersion: 1,
    engineVersion: "1",
    id,
    revision: "top-down-room-v1",
    entrySceneId: "room",
    pixelsPerUnit: 32,
    tickRate: 60,
    inputActions: ["left", "right", "up", "down"],
    assets: {
      player: { assetId: "builtin:player", digest: "builtin:player-v1", width: 32, height: 32 },
      wall: { assetId: "builtin:wall", digest: "builtin:wall-v1", width: 32, height: 32 },
      gem: { assetId: "builtin:gem", digest: "builtin:gem-v1", width: 32, height: 32 },
      "sfx.collect": { assetId: "builtin:sfx.collect", digest: "builtin:sfx.collect-v1", width: 1, height: 1 }
    },
    scenes: [{
      id: "room",
      name: "Top-down room",
      entities: [
        { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
        { id: "player", transform2d: { x: 0, y: 0 }, sprite: { assetId: "player", width: 0.8, height: 0.8, layer: 2 }, body2d: { type: "kinematic" }, collider2d: { width: 0.7, height: 0.7 }, behaviors: [{ kind: "movement", speed: 3, left: "left", right: "right", up: "up", down: "down" }, { kind: "winWhenCollected", count: 1 }] },
        { id: "gem", transform2d: { x: 2, y: 0 }, sprite: { assetId: "gem", width: 0.6, height: 0.6, layer: 1 }, collider2d: { width: 0.6, height: 0.6, sensor: true }, behaviors: [{ kind: "collectible", score: 1 }], audioSource: { assetId: "sfx.collect", onEvent: "collected" } },
        { id: "wall-left", transform2d: { x: -7.5, y: 0 }, sprite: { assetId: "wall", width: 1, height: 9, layer: 0 }, body2d: { type: "static" }, collider2d: { width: 1, height: 9 } },
        { id: "wall-right", transform2d: { x: 7.5, y: 0 }, sprite: { assetId: "wall", width: 1, height: 9, layer: 0 }, body2d: { type: "static" }, collider2d: { width: 1, height: 9 } },
        { id: "wall-top", transform2d: { x: 0, y: 4 }, sprite: { assetId: "wall", width: 16, height: 1, layer: 0 }, body2d: { type: "static" }, collider2d: { width: 16, height: 1 } },
        { id: "wall-bottom", transform2d: { x: 0, y: -4 }, sprite: { assetId: "wall", width: 16, height: 1, layer: 0 }, body2d: { type: "static" }, collider2d: { width: 16, height: 1 } }
      ]
    }]
  });
}

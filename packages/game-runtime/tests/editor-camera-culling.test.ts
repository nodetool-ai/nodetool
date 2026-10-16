import { expect, it } from "vitest";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createTopDownRoomGame } from "../src/index.js";

function fixture(): GameDocument {
  const base = createTopDownRoomGame("editor-camera-culling");
  return gameDocument.parse({ ...base, schemaVersion: 2, scenes: [{ ...base.scenes[0],
    lighting: { ambient: { color: "#ffffff", intensity: 0.1 }, points: [] },
    entities: [...base.scenes[0].entities, { id: "remote", transform2d: { x: 40, y: 0 },
      sprite: { assetId: "gem", width: 1, height: 1 },
      tilemap: { assetId: "wall", tiles: [{ x: 0, y: 0, width: 1, height: 1 }] },
      light2d: { color: "#ff0000", intensity: 1, radius: 1 } }]
  }] });
}

it.each([
  { name: "pan/frame selection", x: 40, zoom: 1, aspectRatio: 16 / 9, visible: true },
  { name: "zoom out", x: 0, zoom: 0.1, aspectRatio: 16 / 9, visible: true },
  { name: "wide aspect", x: 0, zoom: 1, aspectRatio: 16, visible: true },
  { name: "portrait aspect", x: 0, zoom: 1, aspectRatio: 0.5, visible: false },
  { name: "zoom in", x: 0, zoom: 2, aspectRatio: 16 / 9, visible: false }
])("culls tiles and lights using the requested $name view", ({ x, zoom, aspectRatio, visible }) => {
  const session = createGameSession(fixture(), 1);
  try {
    const original = session.frame();
    expect(original.sprites.some((sprite) => sprite.entityId === "remote")).toBe(true);
    expect(original.tiles.some((tile) => tile.entityId === "remote")).toBe(false);
    expect(original.lighting?.points).toEqual([]);
    const before = session.snapshot();
    expect(session.frame({})).toEqual(original);
    const frame = session.frame({ camera: { x, y: 0, zoom }, aspectRatio });
    expect(frame.camera).toEqual({ x, y: 0, zoom });
    expect(frame.width).toBe(frame.height * aspectRatio);
    expect(frame.tiles.some((tile) => tile.entityId === "remote")).toBe(visible);
    expect(frame.lighting?.points.some((point) => point.x === 40)).toBe(visible);
    expect(session.snapshot()).toEqual(before);
    expect(session.frame()).toEqual(original);
  } finally { session.dispose(); }
});

it("keeps default frames, snapshots and events identical over 120 ticks with seed 1, view reads and restore from tick 60", () => {
  const game = fixture();
  const plain = createGameSession(game, 1);
  const viewed = createGameSession(game, 1);
  const inputs = Array.from({ length: 120 }, (_, tick) => ({ pressed: tick < 60 ? ["right"] : ["left"], justPressed: [] }));
  try {
    for (const input of inputs.slice(0, 60)) {
      viewed.frame({ camera: { x: 40, y: 0, zoom: 2 }, aspectRatio: 0.5 });
      expect(viewed.step(input)).toEqual(plain.step(input));
      expect(viewed.snapshot()).toEqual(plain.snapshot());
    }
    const restored = createGameSession(game, 1, viewed.snapshot());
    try {
      for (const input of inputs.slice(60)) {
        restored.frame({ camera: { x: 40, y: 0, zoom: 0.5 }, aspectRatio: 3 });
        expect(restored.step(input)).toEqual(plain.step(input));
        expect(restored.snapshot()).toEqual(plain.snapshot());
      }
      expect(restored.snapshot().tick).toBe(120);
    } finally { restored.dispose(); }
  } finally { plain.dispose(); viewed.dispose(); }
});


it.each([
  { camera: { x: 0, y: 0, zoom: 0 } },
  { camera: { x: Infinity, y: 0, zoom: 1 } },
  { camera: { x: 0, y: 0, zoom: 1, previousX: NaN } },
  { aspectRatio: 0 },
  { aspectRatio: Infinity }
])("rejects an invalid presentation view without stopping the game session: %j", (view) => {
  const session = createGameSession(fixture(), 1);
  try {
    const before = session.snapshot();
    expect(() => session.frame(view)).toThrow();
    expect(session.snapshot()).toEqual(before);
    expect(session.step({ pressed: [], justPressed: [] }).tick).toBe(1);
  } finally { session.dispose(); }
});

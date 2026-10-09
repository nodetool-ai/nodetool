import { describe, expect, it } from "vitest";

import {
  filterGameAssetCatalog,
  gameAssetCatalog,
  gameAssetSiblingRebinds,
  gameDocument,
  gameDocument3D,
  gameSlotGenerationRequest,
  gameSlotSpec
} from "../src/index.js";

const digest = (char: string): string => char.repeat(64);
const image = (char: string, extra: Record<string, unknown> = {}) =>
  ({ assetId: `asset-${char}`, digest: digest(char), width: 64, height: 32, ...extra });

const game2D = gameDocument.parse({
  schemaVersion: 2, engineVersion: "1", id: "game", revision: "draft", entrySceneId: "room", tickRate: 60,
  pixelsPerUnit: 32, inputActions: [],
  renderEffects: [{ kind: "lut", assetId: "grade", size: 16 }],
  assets: {
    player: image("a"),
    "player.frame.0": image("a", { frame: { x: 0, y: 0, width: 32, height: 32 } }),
    "player.frame.1": image("a", { frame: { x: 32, y: 0, width: 32, height: 32 } }),
    collect: { assetId: "asset-c", digest: digest("c"), mediaKind: "audio", width: 1, height: 1 },
    grade: image("d"),
    unused: image("e")
  },
  scenes: [
    { id: "room", name: "Room", entities: [
      { id: "hero", name: "Hero", transform2d: { x: 0, y: 0 }, sprite: { assetId: "player.frame.1", width: 1, height: 1 },
        audioSource: { assetId: "collect", onEvent: "collect" } },
      { id: "plain", transform2d: { x: 0, y: 0 } }
    ], music: { assetId: "collect" } },
    { id: "empty", name: "Empty", entities: [] }
  ]
});

describe("gameAssetCatalog", () => {
  it("lists where each bound slot is used across entities, scene settings and document settings", () => {
    const catalog = gameAssetCatalog(game2D);
    const bySlot = Object.fromEntries(catalog.assets.map((entry) => [entry.slot, entry]));
    expect(catalog.assets.map((entry) => entry.slot)).toEqual(["collect", "grade", "player", "player.frame.0", "player.frame.1", "unused"]);
    expect(bySlot["player.frame.1"].usedBy).toEqual([
      { kind: "entity", sceneId: "room", entityId: "hero", name: "Hero", path: "sprite.assetId" }
    ]);
    expect(bySlot["player.frame.1"].siblingOf).toBe("player");
    expect(bySlot.collect.usedBy).toEqual([
      { kind: "scene", sceneId: "room", name: "Room", path: "music.assetId" },
      { kind: "entity", sceneId: "room", entityId: "hero", name: "Hero", path: "audioSource.assetId" }
    ]);
    expect(bySlot.collect.mediaKind).toBe("audio");
    expect(bySlot.grade.usedBy).toEqual([{ kind: "document", path: "renderEffects.0.assetId" }]);
    expect(bySlot.unused.usedBy).toEqual([]);
    expect(catalog.scenes).toEqual([
      { id: "room", name: "Room", entry: true, entityCount: 2, assets: ["collect", "player.frame.1"] },
      { id: "empty", name: "Empty", entry: false, entityCount: 0, assets: [] }
    ]);
    expect(catalog.prefabs).toEqual([]);
  });

  it("flags frame bindings left on the old bytes after the sheet is replaced", () => {
    const replaced = { ...game2D, assets: { ...game2D.assets, player: { ...game2D.assets.player, digest: digest("f"), assetId: "asset-f" } } };
    const entry = gameAssetCatalog(replaced).assets.find((asset) => asset.slot === "player");
    expect(entry?.staleSiblings).toEqual(["player.frame.0", "player.frame.1"]);
    expect(gameAssetCatalog(game2D).assets.find((asset) => asset.slot === "player")?.staleSiblings).toEqual([]);
  });

  it("lists 3D prefabs with their assets and the instances retained authoring placed", () => {
    const game = gameDocument3D.parse({
      schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
      tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 }, inputActions: [],
      assets: {
        crate: { mediaKind: "model", assetId: "asset-crate", digest: digest("1"), bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
          nodeIds: [], clipIds: [], geometryBytes: 1, textureBytes: 0, triangles: 12 },
        hull: { mediaKind: "collider", assetId: "asset-hull", digest: digest("2"), shape: "convexHull",
          bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, vertices: 8, triangles: 12 }
      },
      prefabs: { box: { rootId: "root", entities: [{ id: "root", name: "Crate", transform3d: {}, model: { assetId: "crate" },
        collider3d: { kind: "convexHull", assetId: "hull" } }] } },
      authoring: { version: 1, program: { source: "build()", inputs: {}, seed: 1 }, baseline: {}, prefabs: {}, instances: [{ sceneId: "scene", entityId: "crate-1", prefabId: "box" }] },
      scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "crate-1", name: "Crate", transform3d: {}, model: { assetId: "crate" } }
      ] }]
    });
    const catalog = gameAssetCatalog(game);
    expect(catalog.prefabs).toEqual([{ id: "box", source: "document", entityCount: 1, assets: ["crate", "hull"],
      usedBy: [{ kind: "entity", sceneId: "scene", entityId: "crate-1", path: "authoring.instances" }] }]);
    const crate = catalog.assets.find((entry) => entry.slot === "crate");
    expect(crate?.mediaKind).toBe("model");
    expect(crate?.usedBy).toEqual([
      { kind: "entity", sceneId: "scene", entityId: "crate-1", name: "Crate", path: "model.assetId" },
      { kind: "prefab", prefabId: "box", entityId: "root", name: "Crate", path: "model.assetId" }
    ]);
  });

  it("indexes a document with many entities in linear time", () => {
    const entities = Array.from({ length: 4000 }, (_, index) => ({ id: `e${index}`, transform2d: { x: 0, y: 0 },
      sprite: { assetId: index % 2 ? "player" : "unused", width: 1, height: 1 } }));
    const large = { ...game2D, scenes: [{ ...game2D.scenes[0], entities }] };
    const started = performance.now();
    const catalog = gameAssetCatalog(large);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(catalog.assets.find((entry) => entry.slot === "player")?.usedBy).toHaveLength(2000);
  });
});

describe("filterGameAssetCatalog", () => {
  it("matches slots, digests and the entities that use an asset, and narrows by media kind", () => {
    const catalog = gameAssetCatalog(game2D);
    expect(filterGameAssetCatalog(catalog, { query: "HERO" }).assets.map((entry) => entry.slot)).toEqual(["collect", "player.frame.1"]);
    expect(filterGameAssetCatalog(catalog, { query: "dddd" }).assets.map((entry) => entry.slot)).toEqual(["grade"]);
    expect(filterGameAssetCatalog(catalog, { kind: "audio" }).assets.map((entry) => entry.slot)).toEqual(["collect"]);
    expect(filterGameAssetCatalog(catalog, { query: "empty" }).scenes.map((entry) => entry.id)).toEqual(["empty"]);
    expect(filterGameAssetCatalog(catalog, { query: "  " })).toEqual(catalog);
  });
});

describe("gameAssetSiblingRebinds", () => {
  it("moves frame bindings onto the replacement bytes and keeps each frame", () => {
    const parent = { ...game2D.assets.player, assetId: "asset-new", digest: digest("f") };
    const { ops, skipped } = gameAssetSiblingRebinds(game2D.assets, "player", parent);
    expect(skipped).toEqual([]);
    expect(ops).toEqual([
      { op: "bind_asset", slot: "player.frame.0", binding: { ...game2D.assets["player.frame.0"], assetId: "asset-new", digest: digest("f") } },
      { op: "bind_asset", slot: "player.frame.1", binding: { ...game2D.assets["player.frame.1"], assetId: "asset-new", digest: digest("f") } }
    ]);
  });

  it("leaves a frame that would fall outside a smaller replacement on the old bytes", () => {
    const parent = { ...game2D.assets.player, assetId: "asset-new", digest: digest("f"), width: 32, height: 32 };
    const { ops, skipped } = gameAssetSiblingRebinds(game2D.assets, "player", parent);
    expect(ops.map((op) => op.slot)).toEqual(["player.frame.0"]);
    expect(skipped).toEqual(["player.frame.1"]);
  });
});

describe("gameSlotGenerationRequest", () => {
  it("cuts a spritesheet slot to its animation grid and sizes image slots", () => {
    const sheet = gameSlotGenerationRequest(gameSlotSpec.parse({ id: "player", kind: "spritesheet", cell: [32, 32],
      animations: { idle: 1, walk: 4 }, prompt: "top-down player character" }));
    expect(sheet.kind).toBe("image");
    expect(sheet.preparation).toEqual({ sheet: { cols: 4, rows: 2 } });
    expect(sheet.prompt).toContain("top-down player character");
    expect(sheet.prompt).toContain("4x2 grid");
    const tiles = gameSlotGenerationRequest(gameSlotSpec.parse({ id: "wall", kind: "tileset", cell: [32, 32], count: 1, prompt: "wall" }));
    expect(tiles.preparation).toEqual({ targetWidth: 32, targetHeight: 32, cropPolicy: "cover" });
    expect(gameSlotGenerationRequest(gameSlotSpec.parse({ id: "sfx.hit", kind: "sfx", seconds: 0.4, prompt: "hit" })).kind).toBe("sfx");
  });
});

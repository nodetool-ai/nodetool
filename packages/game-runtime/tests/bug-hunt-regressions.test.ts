import { describe, expect, it } from "vitest";
import { anyGameDocument, gameDocument, gameEntity3D, gameInputFrame3D, type GameAnimationGraph3D, type GameDocument, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps, createTopDownRoomGame, GameOpError, validateGame } from "../src/index.js";
import { applyGameOps3D } from "../src/document-ops3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { createGameSession3D } from "../src/session3d.js";
import { frame3D } from "../src/systems/presentation3d.js";
import { ZERO3 } from "../src/spatial3d/math.js";
import type { EntityState3D } from "../src/spatial3d/state.js";
import { blockout } from "./fixtures-game3d.js";

function game2D(): GameDocument {
  return { ...createTopDownRoomGame("bug-hunt-2d"), schemaVersion: 2 as const };
}

function modelAsset() {
  return {
    mediaKind: "model" as const,
    assetId: "hero",
    digest: "digest",
    required: true,
    format: "glb" as const,
    preparationVersion: "1" as const,
    bounds: { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 2, z: 0.5 } },
    nodeIds: ["node:0"],
    clipIds: ["clip:0"],
    geometryBytes: 1,
    textureBytes: 0,
    triangles: 1,
    supportedExtensions: []
  };
}

function simpleGraph(): GameAnimationGraph3D {
  return {
    parameters: { speed: { kind: "float", default: 0 } },
    layers: [
      {
        id: "base",
        mode: "override",
        weight: 1,
        initialState: "idle",
        states: {
          idle: { motion: { kind: "clip", clip: "idle" }, speed: 1, loop: true }
        },
        transitions: []
      }
    ]
  };
}

describe("P0: prototype property lookup bugs in validation and animation runtime", () => {
  it("validateGame3D reports missing_animation_graph instead of crashing on Object.prototype keys", () => {
    const doc = blockout();
    doc.assets.hero = modelAsset();
    doc.animationGraphs = { locomotion: simpleGraph() };
    const player = doc.scenes[0].entities.find((e) => e.id === "player")!;
    player.model = { assetId: "hero", castShadow: true, receiveShadow: true };
    player.animator3d = { clips: { idle: "clip:0" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "toString" };

    const result = validateGame3D(doc);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "missing_animation_graph")).toBe(true);
  });

  it("validateGame3D rejects Object.prototype keys in initialClip, spawn.prefabId, and prefab.externalAssets", () => {
    const doc = blockout();
    doc.assets.hero = modelAsset();
    const player = doc.scenes[0].entities.find((e) => e.id === "player")!;
    player.model = { assetId: "hero", castShadow: true, receiveShadow: true };
    player.animator3d = { clips: { idle: "clip:0" }, initialClip: "toString", playbackRate: 1, loop: true, transitionTicks: 0 };
    player.behaviors.push({ kind: "spawn", prefabId: "toString", onEvent: "go" });
    doc.prefabs.box = {
      rootId: "root",
      externalAssets: ["toString"],
      externalScenes: [],
      entities: [gameEntity3D.parse({ id: "root", transform3d: {} })]
    };

    const result = validateGame3D(doc);
    expect(result.valid).toBe(false);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(["missing_animation_clip", "missing_prefab", "missing_asset"]));
  });

  it("validateGame reports missing asset (not undefined mediaKind) when assetId is 'toString'", () => {
    const doc = game2D();
    doc.scenes[0].music = { assetId: "toString", volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 };
    const result = validateGame(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing asset toString"))).toBe(true);
  });

  it("setAnimParam rejects Object.prototype property names like 'toString'", async () => {
    const doc = blockout();
    doc.assets.hero = modelAsset();
    doc.animationGraphs = { locomotion: simpleGraph() };
    const player = doc.scenes[0].entities.find((e) => e.id === "player")!;
    player.model = { assetId: "hero", castShadow: true, receiveShadow: true };
    player.animator3d = { clips: { idle: "clip:0" }, playbackRate: 1, loop: true, transitionTicks: 0, graph: "locomotion" };
    player.behaviors = [
      { kind: "script", maxTickMs: 20, maxCommands: 16, source: "() => ({ state: null, commands: [{ kind: 'setAnimParam', name: 'toString', value: true }] })" }
    ];

    const session = await createGameSession3D(doc, 1);
    try {
      expect(() => session.step(gameInputFrame3D.parse({ pressed: [] }))).toThrow(/Unknown animation parameter toString/);
    } finally {
      session.dispose();
    }
  });
});

describe("P0: prototype lookup crash, silent no-ops, and prototype mutation in document-ops", () => {
  it("applyGameOps3D throws GameOpError (not TypeError) on instantiate_prefab with 'toString'", () => {
    const doc = blockout();
    expect(() =>
      applyGameOps3D(doc, [{ op: "instantiate_prefab", scene_id: doc.entrySceneId, prefab_id: "toString", instance_id: "inst" }])
    ).toThrow(GameOpError);
  });

  it("applyGameOps3D rejects remove_prefab, unbind_asset, and remove_animation_graph on Object.prototype keys", () => {
    const doc = blockout();
    doc.animationGraphs = { locomotion: simpleGraph() };
    expect(() => applyGameOps3D(doc, [{ op: "remove_prefab", prefab_id: "toString" }])).toThrow(GameOpError);
    expect(() => applyGameOps3D(doc, [{ op: "unbind_asset", slot: "toString" }])).toThrow(GameOpError);
    expect(() => applyGameOps3D(doc, [{ op: "remove_animation_graph", graph_id: "toString" }])).toThrow(GameOpError);
  });

  it("applyGameOps (2D) rejects unbind_asset on Object.prototype keys", () => {
    const doc = game2D();
    expect(() => applyGameOps(doc, [{ op: "unbind_asset", slot: "toString" }])).toThrow(GameOpError);
  });

  it("bind_asset and set_prefab reject '__proto__' instead of mutating object prototypes", () => {
    const doc2D = game2D();
    expect(() =>
      applyGameOps(doc2D, [{ op: "bind_asset", slot: "__proto__", binding: { assetId: "a", digest: "d", width: 16, height: 16 } }])
    ).toThrow(GameOpError);

    const doc3D = blockout();
    expect(() =>
      applyGameOps3D(doc3D, [{ op: "bind_asset", slot: "__proto__", binding: { mediaKind: "audio", assetId: "a", digest: "d", required: true } }])
    ).toThrow(GameOpError);
    expect(() =>
      applyGameOps3D(doc3D, [{
        op: "set_prefab",
        prefab_id: "__proto__",
        prefab: { rootId: "r", externalAssets: [], externalScenes: [], entities: [gameEntity3D.parse({ id: "r", transform3d: {} })] }
      }])
    ).toThrow(GameOpError);
  });
});

describe("P1: stale entity index after reset_override in applyGameOps (2D)", () => {
  it("allows updating a suppressed entity restored by reset_override in the same op batch", () => {
    const base = game2D();
    const withAuthoring = gameDocument.parse(
      anyGameDocument.parse({
        ...base,
        scenes: [{ ...base.scenes[0], entities: base.scenes[0].entities.filter((e) => e.id !== "gem") }],
        authoring: {
          version: 1,
          program: { source: "return builder.game();", inputs: {}, seed: 1 },
          baseline: base,
          suppressions: [{ sceneId: "room", entityId: "gem" }]
        }
      })
    );

    const result = applyGameOps(withAuthoring, [
      { op: "reset_override", scene_id: "room", entity_id: "gem" },
      { op: "update_entity", scene_id: "room", entity_id: "gem", set: { name: "Restored gem" } }
    ]);
    const restored = result.scenes[0].entities.find((e) => e.id === "gem");
    expect(restored?.name).toBe("Restored gem");
  });
});

describe("P1: unclamped previousScale in frame3D for lifetime entities", () => {
  it("clamps previousTransform.scale to endScale when tick exceeds spawnTick + lifetime.ticks + 1", () => {
    const doc: GameDocument3D = blockout();
    const fxDef = gameEntity3D.parse({
      id: "fx",
      transform3d: {},
      primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 } },
      behaviors: [{ kind: "lifetime", ticks: 10, endScale: 0.2, fade: true }]
    });
    const cameraDef = doc.scenes[0].entities.find((e) => e.id === doc.scenes[0].activeCameraId)!;
    const states: EntityState3D[] = [
      {
        definition: cameraDef,
        definitionId: cameraDef.id,
        spawnTick: 0,
        active: true,
        transform: structuredClone(cameraDef.transform3d),
        localTransform: structuredClone(cameraDef.transform3d),
        previousTransform: structuredClone(cameraDef.transform3d),
        velocity: { ...ZERO3 },
        angularVelocity: { ...ZERO3 }
      },
      {
        definition: fxDef,
        definitionId: fxDef.id,
        spawnTick: 0,
        active: true,
        transform: structuredClone(fxDef.transform3d),
        localTransform: structuredClone(fxDef.transform3d),
        previousTransform: structuredClone(fxDef.transform3d),
        velocity: { ...ZERO3 },
        angularVelocity: { ...ZERO3 }
      }
    ];

    const rendered = frame3D(
      doc,
      doc.scenes[0],
      states,
      { entityId: cameraDef.id, transform: structuredClone(cameraDef.transform3d), yaw: 0, pitch: 0 },
      structuredClone(cameraDef.transform3d),
      15,
      0,
      false,
      new Map(),
      new Map()
    );
    const fx = rendered.entities.find((e) => e.entityId === "fx")!;
    expect(fx.transform.scale.x).toBeCloseTo(0.2);
    expect(fx.previousTransform.scale.x).toBeCloseTo(0.2);
  });
});

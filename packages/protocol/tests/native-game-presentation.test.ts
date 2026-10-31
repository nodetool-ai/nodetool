import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nativeGameEnvironment3D, nativeGameLight3D, nativeGameParticles, nativeGameUiTree, nativeGameCamera3D, nativeGameScriptCommand, nativeGameMaterial3D } from "../src/native-game.js";
import { z } from "zod";
const legacy = z.object({ scenes: z.array(z.object({ environment: z.unknown(), entities: z.array(z.record(z.string(), z.unknown())) })), prefabs: z.record(z.string(), z.object({ entities: z.array(z.record(z.string(), z.unknown())) })), ui: z.unknown() }).parse(JSON.parse(readFileSync(new URL("../../game-runtime/samples/blacksite/game.json", import.meta.url), "utf8")));
describe("native BLACKSITE presentation contract", () => {
  it("admits every actual authored environment, light, particle emitter, UI node and camera", () => {
    let lights = 0, emitters = 0, cameras = 0;
    for (const scene of legacy.scenes) {
      expect(nativeGameEnvironment3D.safeParse(scene.environment).success).toBe(true);
      for (const entity of [...scene.entities, ...Object.values(legacy.prefabs).flatMap(prefab => prefab.entities)]) {
        if (entity.light3d) { nativeGameLight3D.parse(entity.light3d); lights++; }
        if (entity.particles) { emitters += nativeGameParticles.parse(entity.particles).emitters.length; }
        if (entity.camera3d) { nativeGameCamera3D.parse(entity.camera3d); cameras++; }
        if (entity.primitive) { const primitive = z.object({ material: z.unknown() }).parse(entity.primitive); nativeGameMaterial3D.parse(primitive.material); }
      }
    }
    expect(lights).toBe(23); expect(emitters).toBe(33); expect(cameras).toBe(1);
    expect(nativeGameUiTree.parse(legacy.ui).nodes).toHaveLength(30);
  });
  it("rejects unsupported environment, light and UI branches instead of silently dropping them", () => {
    const environment = nativeGameEnvironment3D.parse(legacy.scenes[0]?.environment);
    for (const patch of [{ sky: { kind: "hdri", assetId: "sky" } }, { fog: { color: "#000000", near: 1, far: 10 } }, { postProcessing: undefined }, { postProcessing: { ...environment.postProcessing, enabled: false } }, { postProcessing: { ...environment.postProcessing, toneMapping: "aces" } }, { postProcessing: { ...environment.postProcessing, antialias: "fxaa" } }]) {
      expect(nativeGameEnvironment3D.safeParse({ ...environment, ...patch }).success).toBe(false);
    }
    expect(nativeGameLight3D.safeParse({ kind: "spot", color: "#ffffff", intensity: 1, range: 10, angle: 1 }).success).toBe(false);
    expect(nativeGameUiTree.safeParse({ nodes: [{ kind: "image", id: "image", assetId: "image" }] }).success).toBe(false);
    expect(nativeGameParticles.safeParse({ emitters: [{ id: "unsupported", sprite: { assetId: "image" } }] }).success).toBe(false);
    expect(nativeGameParticles.safeParse({ emitters: [{ id: "unsupported", shape: { kind: "circle", radius: 1 } }] }).success).toBe(false);
  });
  it("exposes typed UI, emitter and nonphysical quaternion rotation commands", () => {
    expect(nativeGameScriptCommand.parse({ kind: "ui", id: "ammo-value", text: "23" })).toEqual({ kind: "ui", id: "ammo-value", text: "23" });
    expect(nativeGameScriptCommand.parse({ kind: "emitParticles", emitter: "flash", count: 3 })).toEqual({ kind: "emitParticles", emitter: "flash", count: 3 });
    expect(nativeGameScriptCommand.safeParse({ kind: "setVisual", rotation: [0, 0, 0, 1] }).success).toBe(true);
    expect(nativeGameScriptCommand.safeParse({ kind: "setVisual", scale: [1, 1, 1] }).success).toBe(false);
  });
});

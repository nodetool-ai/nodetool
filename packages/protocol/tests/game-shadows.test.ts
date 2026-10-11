import { describe, expect, it } from "vitest";
import { GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D, gameEnvironment3D, gameLight3D, gameRenderFrame3D, gameShadowCascades3D } from "../src/game3d.js";

describe("3D shadow settings", () => {
  it("keeps environments and lights without the new fields unchanged", () => {
    expect(gameEnvironment3D.parse({}).shadows).toEqual({ enabled: true, mapSize: 1024, extent: 30 });
    expect(gameLight3D.parse({ kind: "directional", color: "#ffffff", intensity: 1 })).toEqual({ kind: "directional", color: "#ffffff", intensity: 1, castShadow: false });
    expect(gameLight3D.parse({ kind: "point", color: "#ffffff", intensity: 1, range: 5 })).toEqual({ kind: "point", color: "#ffffff", intensity: 1, range: 5, decay: 2 });
    expect(gameLight3D.parse({ kind: "spot", color: "#ffffff", intensity: 1, range: 5, angle: 0.5 }))
      .toEqual({ kind: "spot", color: "#ffffff", intensity: 1, range: 5, angle: 0.5, penumbra: 0, decay: 2 });
  });

  it("fills bounded cascade defaults", () => {
    expect(gameShadowCascades3D.parse({})).toEqual({ count: 3, split: 0.5, maxDistance: 200 });
    const environment = gameEnvironment3D.parse({ shadows: { enabled: true, mapSize: 2048, extent: 30, cascades: { count: 4, split: 0.8 } } });
    expect(environment.shadows.cascades).toEqual({ count: 4, split: 0.8, maxDistance: 200 });
  });

  it("accepts per-light shadow casting and bias on every light kind", () => {
    const bias = { shadowBias: -0.0005, shadowNormalBias: 0.02 };
    expect(gameLight3D.parse({ kind: "directional", color: "#ffffff", intensity: 1, castShadow: true, ...bias })).toMatchObject(bias);
    expect(gameLight3D.parse({ kind: "point", color: "#ffffff", intensity: 1, range: 5, castShadow: true, ...bias })).toMatchObject({ castShadow: true, ...bias });
    expect(gameLight3D.parse({ kind: "spot", color: "#ffffff", intensity: 1, range: 5, angle: 0.5, castShadow: true, ...bias })).toMatchObject({ castShadow: true, ...bias });
  });

  it("rejects out-of-range cascade and bias values", () => {
    for (const cascades of [{ count: 1 }, { count: 5 }, { count: 2.5 }, { split: -0.1 }, { split: 1.1 }, { maxDistance: 0 }, { maxDistance: 5001 }, { fade: true }]) {
      expect(gameShadowCascades3D.safeParse(cascades).success, JSON.stringify(cascades)).toBe(false);
    }
    for (const bias of [{ shadowBias: 0.02 }, { shadowBias: -0.02 }, { shadowNormalBias: -0.1 }, { shadowNormalBias: 2 }, { shadowBias: Number.NaN }]) {
      expect(gameLight3D.safeParse({ kind: "point", color: "#ffffff", intensity: 1, range: 5, ...bias }).success, JSON.stringify(bias)).toBe(false);
    }
  });

  it("budgets four shadowed local lights", () => {
    expect(GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D).toBe(4);
  });

  it("carries shadow settings through render frames", () => {
    const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
    const frame = gameRenderFrame3D.parse({ dimension: "3d", gameId: "game", sceneId: "scene", tick: 1,
      presentation: { aspectRatio: 1, hudWidth: 64, hudHeight: 64 },
      camera: { entityId: "camera", transform, projection: { kind: "perspective" } }, entities: [],
      lights: [{ entityId: "lamp", transform, light: { kind: "spot", color: "#ffffff", intensity: 1, range: 5, angle: 0.5, castShadow: true, shadowBias: -0.001 } }],
      environment: { shadows: { enabled: true, mapSize: 1024, extent: 30, cascades: { count: 2 } } }, hud: [] });
    expect(frame.environment.shadows.cascades).toEqual({ count: 2, split: 0.5, maxDistance: 200 });
    expect(frame.lights[0]?.light).toMatchObject({ castShadow: true, shadowBias: -0.001 });
  });
});

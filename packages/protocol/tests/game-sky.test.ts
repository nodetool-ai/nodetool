import { describe, expect, it } from "vitest";
import { gameEnvironment3D, gameRenderFrame3D, gameScene3D, gameSky3D } from "../src/game3d.js";

describe("3D environment sky", () => {
  it("keeps environments without a sky unchanged", () => {
    const environment = gameEnvironment3D.parse({});
    expect(environment).not.toHaveProperty("sky");
    expect(gameScene3D.parse({ id: "scene", name: "Scene", activeCameraId: "camera", entities: [] }).environment).not.toHaveProperty("sky");
  });

  it("fills bounded defaults for each sky kind", () => {
    expect(gameSky3D.parse({ kind: "color" })).toEqual({ kind: "color" });
    expect(gameSky3D.parse({ kind: "hdri", assetId: "sky" })).toEqual({ kind: "hdri", assetId: "sky", rotation: 0, intensity: 1 });
    expect(gameSky3D.parse({ kind: "procedural" })).toEqual({ kind: "procedural", turbidity: 10, rayleigh: 2, groundColor: "#3d3a36", intensity: 1 });
    expect(gameEnvironment3D.parse({ sky: { kind: "procedural", sunEntityId: "sun" } }).sky).toMatchObject({ kind: "procedural", sunEntityId: "sun" });
  });

  it("rejects unbounded, unknown and malformed sky fields", () => {
    for (const sky of [
      { kind: "hdri" }, { kind: "hdri", assetId: "" }, { kind: "hdri", assetId: "sky", intensity: 9 },
      { kind: "hdri", assetId: "sky", intensity: -1 }, { kind: "hdri", assetId: "sky", rotation: 7 },
      { kind: "hdri", assetId: "sky", rotation: Number.NaN }, { kind: "procedural", turbidity: 0.5 },
      { kind: "procedural", turbidity: 21 }, { kind: "procedural", rayleigh: 5 }, { kind: "procedural", groundColor: "green" },
      { kind: "procedural", sunEntityId: "" }, { kind: "color", assetId: "sky" }, { kind: "gradient" }
    ]) {
      expect(gameSky3D.safeParse(sky).success, JSON.stringify(sky)).toBe(false);
    }
  });

  it("carries the sky through render frames", () => {
    const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
    const frame = gameRenderFrame3D.parse({ dimension: "3d", gameId: "game", sceneId: "scene", tick: 1,
      presentation: { aspectRatio: 1, hudWidth: 64, hudHeight: 64 },
      camera: { entityId: "camera", transform, projection: { kind: "perspective" } }, entities: [], lights: [],
      environment: { sky: { kind: "hdri", assetId: "sky", rotation: 1.5 } }, hud: [] });
    expect(frame.environment.sky).toEqual({ kind: "hdri", assetId: "sky", rotation: 1.5, intensity: 1 });
  });
});

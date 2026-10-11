import { describe, expect, it } from "vitest";
import { gameEnvironment3D, gamePostProcessing3D, gameRenderFrame3D, gameScene3D } from "../src/game3d.js";

describe("3D post-processing settings", () => {
  it("keeps environments without post-processing unchanged", () => {
    expect(gameEnvironment3D.parse({})).not.toHaveProperty("postProcessing");
    expect(gameScene3D.parse({ id: "scene", name: "Scene", activeCameraId: "camera", entities: [] }).environment).not.toHaveProperty("postProcessing");
  });

  it("fills defaults that match the renderer without post-processing", () => {
    expect(gamePostProcessing3D.parse({})).toEqual({ enabled: true, exposure: 1, toneMapping: "aces", antialias: "msaa" });
    expect(gamePostProcessing3D.parse({ bloom: {}, vignette: {} })).toEqual({ enabled: true, exposure: 1, toneMapping: "aces", antialias: "msaa",
      bloom: { threshold: 0.85, softness: 0.1, radius: 0.4, intensity: 1 }, vignette: { intensity: 0.4, radius: 0.5, softness: 0.5 } });
    for (const toneMapping of ["aces", "agx", "neutral", "linear"]) {
      expect(gamePostProcessing3D.parse({ toneMapping }).toneMapping).toBe(toneMapping);
    }
    for (const antialias of ["msaa", "fxaa", "smaa", "none"]) {
      expect(gamePostProcessing3D.parse({ antialias }).antialias).toBe(antialias);
    }
  });

  it("rejects unbounded, unknown and malformed fields", () => {
    for (const settings of [
      { exposure: 0 }, { exposure: 17 }, { exposure: Number.NaN }, { toneMapping: "filmic" }, { antialias: "taa" },
      { bloom: { threshold: -0.1 } }, { bloom: { threshold: 9 } }, { bloom: { softness: 0.6 } }, { bloom: { radius: 1.5 } },
      { bloom: { intensity: 5 } }, { bloom: { strength: 1 } }, { vignette: { intensity: 1.2 } }, { vignette: { radius: -1 } },
      { vignette: { softness: 0 } }, { ssao: {} }, { enabled: "yes" }
    ]) {
      expect(gamePostProcessing3D.safeParse(settings).success, JSON.stringify(settings)).toBe(false);
    }
  });

  it("carries post-processing through render frames", () => {
    const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
    const frame = gameRenderFrame3D.parse({ dimension: "3d", gameId: "game", sceneId: "scene", tick: 1,
      presentation: { aspectRatio: 1, hudWidth: 64, hudHeight: 64 },
      camera: { entityId: "camera", transform, projection: { kind: "perspective" } }, entities: [], lights: [],
      environment: { postProcessing: { toneMapping: "agx", bloom: { intensity: 2 } } }, hud: [] });
    expect(frame.environment.postProcessing).toEqual({ enabled: true, exposure: 1, toneMapping: "agx", antialias: "msaa",
      bloom: { threshold: 0.85, softness: 0.1, radius: 0.4, intensity: 2 } });
  });
});

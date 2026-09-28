import { describe, expect, it } from "vitest";
import { makeClip } from "../src/index.js";
import { resolveAnimatedLayerProps } from "../src/render/sceneModel.js";
import { resolveCamera2D } from "../src/render/spatial.js";
import { IDENTITY_TRANSFORM } from "../src/render/transform.js";

describe("camera2d depth", () => {
  it("moves the wall closer when positive camera depth increases", () => {
    const wall = {
      ...IDENTITY_TRANSFORM,
      position: { x: 200, y: 100 },
      depthPx: 0
    };
    const camera = {
      position: { x: 0, y: 0 },
      depthPx: 0,
      focalLengthPx: 1800,
      focusDepthPx: 0,
      aperturePx: 14
    };
    const start = resolveCamera2D(wall, camera);
    const pushed = resolveCamera2D(wall, { ...camera, depthPx: 260 });
    expect(pushed.transform.scale.x).toBeGreaterThan(start.transform.scale.x);
    expect(pushed.transform.position.x).toBeGreaterThan(
      start.transform.position.x
    );
    expect(pushed.transform.scale.x).toBeCloseTo(1800 / 1540);
  });
});

it("renders different displacement for two depth planes during a camera push", () => {
  const camera2d = {
    position: { x: 0, y: 0 },
    depthPx: 0,
    focalLengthPx: 1000,
    keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: 1000, position: { x: 0, y: 0 }, depthPx: 200 }
    ]
  };
  const layers = [-400, 200].map((depthPx) => {
    const transform = {
      ...IDENTITY_TRANSFORM,
      position: { x: 200, y: 0 },
      depthPx
    };
    return {
      clip: makeClip({ mediaType: "shape", durationMs: 2000, transform }),
      transform,
      opacity: 1,
      camera2d
    };
  });
  const moves = layers.map((layer) => {
    const start = resolveAnimatedLayerProps(layer, 0, {
      width: 1080,
      height: 1920
    });
    const pushed = resolveAnimatedLayerProps(layer, 1000, {
      width: 1080,
      height: 1920
    });
    return pushed.transform.position.x - start.transform.position.x;
  });
  expect(moves[0]).toBeGreaterThan(0);
  expect(moves[1]).toBeGreaterThan(moves[0]);
});

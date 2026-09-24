import { describe, expect, it } from "vitest";
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
    expect(pushed.transform.position.x).toBeGreaterThan(start.transform.position.x);
    expect(pushed.transform.scale.x).toBeCloseTo(1800 / 1540);
  });
});

import { expect, it } from "vitest";
import { gameParticles, gameRenderFrame, gameRenderFrame3D } from "@nodetool-ai/protocol";

import { createGameParticlePreview } from "../src/particles/preview.js";
import { gameParticleSamples3D } from "../src/particles/particles3d.js";

it.each(["2d", "3d"] as const)("restarts %s preview from the same seed and frame without simulation state", (dimension) => {
  const definition = gameParticles.parse({ emitters: [{ id: "test", rate: 30, lifetime: 3,
    speed: { min: 1, max: 3 }, size: { min: 0.1, max: 0.3 }, shape: { kind: "sphere", radius: 0.5 } }] });
  const original = structuredClone(definition);
  const first = createGameParticlePreview(definition, dimension);
  const restarted = createGameParticlePreview(definition, dimension);
  for (let tick = 0; tick < 120; tick += 1) { first.step(); restarted.step(); }
  expect(first.frame.tick).toBe(120);
  expect(first.particles.count).toBe(60);
  expect(gameParticleSamples3D(first.particles)).toEqual(gameParticleSamples3D(restarted.particles));
  expect(first.frame).toEqual(restarted.frame);
  expect(definition).toEqual(original);
  if (first.dimension === "3d") {
    expect(gameRenderFrame3D.parse(first.frame)).toEqual(first.frame);
    expect(first.frame.entities.some((entity) => entity.entityId === "preview-floor")).toBe(true);
    const [x, y, z, w] = first.frame.camera.transform.rotation;
    const forward = [-2 * (x * z + w * y), 2 * (w * x - y * z), 2 * (x * x + y * y) - 1];
    const distance = Math.hypot(5, 2, 7);
    [-5, -2, -7].forEach((axis, index) => expect(forward[index]).toBeCloseTo(axis / distance, 12));
  } else {
    expect(gameRenderFrame.parse(first.frame)).toEqual(first.frame);
    expect(first.frame.width * first.frame.pixelsPerUnit).toBe(640);
    expect(first.frame.height * first.frame.pixelsPerUnit).toBe(360);
  }
});

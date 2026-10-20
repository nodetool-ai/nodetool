import { expect, it } from "vitest";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { applyLighting, computeIrradiance, multiplyIrradiance } from "../src/lighting.js";

const frame: GameRenderFrame = { tick: 3, width: 20, height: 12, pixelsPerUnit: 16,
  camera: { x: 0.3, y: -0.2, zoom: 1.25, previousX: 0, previousY: 0 }, sprites: [], tiles: [], hud: [],
  lighting: { ambient: { color: "#3a4060", intensity: 0.6 }, points: [
    { x: -4, y: 2, previousX: -5, previousY: 2, color: "#ffb060", intensity: 1.4, radius: 5, falloff: 2 },
    { x: 3, y: -1, color: "#60d0ff", intensity: 0.9, radius: 3.5, falloff: 1 },
    { x: 9, y: 4, color: "#ffffff", intensity: 2, radius: 2, falloff: 1.5 },
  ] } };

function noise(length: number, seed: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(length);
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) >>> 0;
    pixels[index] = index % 4 === 3 && state % 5 === 0 ? 0 : state >>> 24;
  }
  return pixels;
}

it("lights a sprite region from the shared viewport field exactly as from its own field", () => {
  const viewportWidth = 320;
  const viewportHeight = 192;
  const field = computeIrradiance(viewportWidth, viewportHeight, frame, 0.4);
  expect(field).not.toBeNull();
  const regions = [{ x: 0, y: 0, width: 320, height: 192 }, { x: 37, y: 11, width: 90, height: 61 },
    { x: 250, y: 140, width: 70, height: 52 }, { x: 5, y: 120, width: 1, height: 9 }];
  for (const [index, region] of regions.entries()) {
    const own = noise(region.width * region.height * 4, index + 7);
    const shared = own.slice();
    applyLighting(own, region.width, region.height, frame, 0.4, { viewportWidth, viewportHeight, x: region.x, y: region.y });
    multiplyIrradiance(shared, region.width, region.height, field!, viewportWidth, region.x, region.y);
    expect(shared).toEqual(own);
  }
});

it("returns no field for an unlit frame", () => {
  expect(computeIrradiance(8, 8, { ...frame, lighting: undefined }, 1)).toBeNull();
});

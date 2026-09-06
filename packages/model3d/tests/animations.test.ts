/**
 * `animationDurations` — how long each animation in a document runs.
 *
 * The timeline's bake wraps or clamps a clip's model time against these, so a
 * wrong length is a loop that stutters or a hold that never lands.
 */

import { describe, expect, it } from "vitest";

import { animationDurations } from "../src/animations.js";
import type { GltfJson } from "../src/gltf.js";

const doc = (overrides: Partial<GltfJson> = {}): GltfJson => ({
  asset: { version: "2.0" },
  ...overrides
});

describe("animationDurations", () => {
  it("reads each animation's length off its sampler input accessor", () => {
    const gltf = doc({
      accessors: [
        { componentType: 5126, count: 2, type: "SCALAR", max: [1.5] },
        { componentType: 5126, count: 2, type: "SCALAR", max: [4] }
      ],
      animations: [
        { name: "Wave", samplers: [{ input: 0 }], channels: [] },
        { name: "Walk", samplers: [{ input: 1 }], channels: [] }
      ]
    });
    expect(animationDurations(gltf)).toEqual([
      { name: "Wave", durationSec: 1.5 },
      { name: "Walk", durationSec: 4 }
    ]);
  });

  it("takes the longest sampler when an animation has several", () => {
    const gltf = doc({
      accessors: [
        { componentType: 5126, count: 2, type: "SCALAR", max: [1] },
        { componentType: 5126, count: 2, type: "SCALAR", max: [3.25] }
      ],
      animations: [
        { name: "Both", samplers: [{ input: 0 }, { input: 1 }], channels: [] }
      ]
    });
    expect(animationDurations(gltf)).toEqual([
      { name: "Both", durationSec: 3.25 }
    ]);
  });

  it("keeps an unnamed or unmeasurable animation in the list at zero", () => {
    const gltf = doc({
      accessors: [{ componentType: 5126, count: 2, type: "SCALAR" }],
      animations: [
        { samplers: [{ input: 0 }], channels: [] },
        { name: "Missing", samplers: [{ input: 9 }], channels: [] }
      ]
    });
    expect(animationDurations(gltf)).toEqual([
      { name: "", durationSec: 0 },
      { name: "Missing", durationSec: 0 }
    ]);
  });

  it("answers nothing for a document with no animations", () => {
    expect(animationDurations(doc())).toEqual([]);
  });
});

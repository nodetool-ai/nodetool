import { expect, it } from "vitest";
import { BLEND_MODE_VALUES } from "@nodetool-ai/gpu";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor, type FrameLayer, type FramePrecomposite } from "../src/render/frameCompositor.js";
import { makeClip } from "../src/index.js";
import { resolveTransition, TRANSITION_TYPES } from "../src/render/transition.js";

const source = (rgba: number[]): FrameLayer["source"] => ({ rgba: new Uint8Array(rgba), width: 1, height: 1 });
const bottom: FrameLayer = { id: "bottom", source: source([64, 96, 128, 255]), opacity: 1, blendMode: "normal", zIndex: 0 };
const top: FrameLayer = { id: "top", source: source([128, 64, 32, 255]), opacity: 0.5, blendMode: "normal", zIndex: 1 };

it("retains blend operations and isolated group opacity in FP16", async () => {
  const device = await getNodeGPUDevice();
  const byte = new HeadlessFrameCompositor(device, 8, 8);
  const half = new HeadlessFrameCompositor(device, 8, 8, { workingFormat: "rgba16float" });
  device.pushErrorScope("validation");
  try {
    for (const blendMode of BLEND_MODE_VALUES) {
      for (const grouped of [false, true]) {
        const layers = [bottom, { ...top, blendMode, ...(grouped ? { precomposeGroupId: "group", opacity: 1 } : {}) }];
        const groups: FramePrecomposite[] = grouped ? [{ id: "group", zIndex: 2, opacity: 0.5, blendMode, effects: [] }] : [];
        const a = await byte.renderFrame(layers, groups);
        const b = await half.renderFrame(layers, groups);
        expect(Math.max(...a.map((v, i) => Math.abs(v - b[i]))), `${blendMode}, grouped=${grouped}`).toBeLessThanOrEqual(1);
        expect(b.some((v, i) => i % 4 !== 3 && v > 0)).toBe(true);
      }
    }
  } finally {
    byte.dispose(); half.dispose();
    expect(await device.popErrorScope()).toBeNull();
  }
});

it("preserves transition geometry and effect semantics in FP16", async () => {
  const device = await getNodeGPUDevice();
  const byte = new HeadlessFrameCompositor(device, 8, 8);
  const half = new HeadlessFrameCompositor(device, 8, 8, { workingFormat: "rgba16float" });
  device.pushErrorScope("validation");
  try {
    for (const type of TRANSITION_TYPES) {
      const outgoing = makeClip({ id: "out", trackId: "track", startMs: 0, durationMs: 1000 });
      const incoming = makeClip({ id: "in", trackId: "track", startMs: 500, durationMs: 1000, transitionIn: { type, durationMs: 500 } });
      const pair = resolveTransition(incoming, [outgoing, incoming], 750)!;
      const layers = [{ ...bottom, transition: pair.outgoing }, { ...top, opacity: 1, transition: pair.incoming }];
      const a = await byte.renderFrame(layers);
      const b = await half.renderFrame(layers);
      expect(Math.max(...a.map((v, i) => Math.abs(v - b[i]))), type).toBeLessThanOrEqual(1);
    }
    // A non-neutral effect must remain visible on a promoted source and on a group.
    for (const grouped of [false, true]) {
      const effects = [{ id: "levels", type: "levels" as const, enabled: true, inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 0.5 }];
      const layers = [{ ...top, opacity: 1, ...(grouped ? { precomposeGroupId: "group" } : { effects }) }];
      const groups: FramePrecomposite[] = grouped ? [{ id: "group", zIndex: 2, opacity: 1, blendMode: "normal", effects }] : [];
      const a = await byte.renderFrame(layers, groups);
      const b = await half.renderFrame(layers, groups);
      expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeLessThanOrEqual(1);
      expect(Array.from(b.slice(0, 4))).toEqual([64, 32, 16, 255]);
    }
  } finally {
    byte.dispose(); half.dispose();
    expect(await device.popErrorScope()).toBeNull();
  }
});

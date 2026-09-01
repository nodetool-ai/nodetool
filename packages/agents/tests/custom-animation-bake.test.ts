/**
 * Baking a custom timeline animation — the one place a custom animation's
 * JavaScript ever runs.
 *
 * Real QuickJS sandbox, no network. What these pin: both output shapes reach
 * curves, the body's own `role`/canvas/params arrive on `inputs`, a body that
 * throws or returns nonsense comes back as a result rather than an exception,
 * and the bake is hermetic (no toolbelt, no secrets) so the same animation
 * bakes the same wherever it runs.
 */

import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  compileClipAnimations,
  sampleAnimations
} from "@nodetool-ai/timeline";
import { bakeCustomAnimation } from "../src/custom-animation-bake.js";
import { createMockContext } from "./_helpers/mock-context.js";

const context = () => createMockContext() as unknown as ProcessingContext;

const BASE = {
  role: "in" as const,
  durationMs: 500,
  clipDurationMs: 3000,
  canvas: { width: 1920, height: 1080 }
};

describe("bakeCustomAnimation", () => {
  it("bakes a sampled function into curves", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `
        const samples = [];
        for (let i = 0; i <= inputs.sampleCount; i++) {
          const t = i / inputs.sampleCount;
          samples.push({ t, opacity: t, offsetY: (1 - t) * inputs.canvasHeight * 0.1 });
        }
        await output("samples", samples);
      `
    });
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    const properties = result.curves!.map((c) => c.property).sort();
    expect(properties).toEqual(["offsetY", "opacity"]);
    const offsetY = result.curves!.find((c) => c.property === "offsetY")!;
    expect(offsetY.keyframes[0].value).toBeCloseTo(108, 6);
    expect(offsetY.keyframes.at(-1)!.value).toBeCloseTo(0, 6);
  });

  it("accepts curves authored directly", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `
        await output("curves", [
          { property: "scale", keyframes: [
            { t: 0, value: 0.5 },
            { t: 1, value: 1, easing: "easeOutBack" }
          ] }
        ]);
      `
    });
    expect(result.ok).toBe(true);
    expect(result.curves).toEqual([
      {
        property: "scale",
        keyframes: [
          { t: 0, value: 0.5 },
          { t: 1, value: 1, easing: "easeOutBack" }
        ]
      }
    ]);
  });

  it("hands the body its role, timings, canvas, and params", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      role: "loop",
      params: { amplitude: 0.25 },
      staggerCount: 4,
      code: `
        await output("samples", [
          { t: 0, offsetX: inputs.canvasWidth * inputs.params.amplitude },
          { t: 0.5, offsetX: inputs.durationMs },
          { t: 1, offsetX: inputs.clipDurationMs + inputs.staggerCount },
        ]);
        await output("probe", inputs.role);
      `
    });
    expect(result.ok).toBe(true);
    expect(result.curves![0].keyframes.map((kf) => kf.value)).toEqual([
      480, 500, 3004
    ]);
  });

  it("carries a mask the body declared for a wipeProgress curve", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `
        await output("samples", [{ t: 0, wipeProgress: 0 }, { t: 1, wipeProgress: 1 }]);
        await output("mask", { direction: "up", softness: 0.2 });
      `
    });
    expect(result.ok).toBe(true);
    expect(result.mask).toEqual({ direction: "up", softness: 0.2 });
  });

  it("refuses a wipeProgress curve the body gave no mask for", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `await output("samples", [{ t: 0, wipeProgress: 0 }, { t: 1, wipeProgress: 1 }]);`
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/needs a mask/);
    expect(result.curves).toBeUndefined();
  });

  it("returns a body's throw as a failed result, not an exception", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `throw new Error("no curve for you");`
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no curve for you");
  });

  it("names what is wrong when the body returns an unusable shape", async () => {
    const noOutput = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `await output("something", 1);`
    });
    expect(noOutput.ok).toBe(false);
    expect(noOutput.error).toMatch(/neither/);

    const badProperty = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `await output("samples", [{ t: 0, wobble: 0 }, { t: 1, wobble: 1 }]);`
    });
    expect(badProperty.ok).toBe(false);
    expect(badProperty.error).toMatch(/wobble/);
  });

  it("runs hermetically — no toolbelt reaches the body", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `
        await output("samples", [
          { t: 0, opacity: typeof nodetool === "undefined" ? 0 : 1 },
          { t: 1, opacity: 1 }
        ]);
      `
    });
    expect(result.ok).toBe(true);
    expect(result.curves![0].keyframes[0].value).toBe(0);
  });

  it("produces curves the timeline engine compiles and samples unchanged", async () => {
    // The seam a unit test on either half alone would miss: what the bake
    // returns has to be exactly what `compileClipAnimations` accepts.
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      durationMs: 1000,
      code: `
        const samples = [];
        for (let i = 0; i <= 100; i++) {
          const t = i / 100;
          samples.push({ t, offsetX: 50 + t * 150 });
        }
        await output("samples", samples);
      `
    });
    expect(result.ok).toBe(true);

    const compiled = compileClipAnimations(
      [
        {
          id: "a1",
          role: "in",
          preset: "custom",
          durationMs: 1000,
          delayMs: 200,
          custom: { curves: result.curves! }
        }
      ],
      3000,
      BASE.canvas
    );
    expect(compiled).toHaveLength(1);
    // Before the window an "in" animation holds the body's t=0 value.
    expect(sampleAnimations(compiled, 100).offsetX).toBeCloseTo(50, 6);
    // Half way through the 1000ms window the body's ramp reads 125px.
    expect(sampleAnimations(compiled, 700).offsetX).toBeCloseTo(125, 6);
    // After it, the layer is back on its own transform — identity, not the
    // curve's end value.
    expect(sampleAnimations(compiled, 2000).offsetX).toBe(0);
  });

  it("passes the body's console output back to the author", async () => {
    const result = await bakeCustomAnimation(context(), {
      ...BASE,
      code: `
        console.log("bounce pass");
        await output("samples", [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }]);
      `
    });
    expect(result.ok).toBe(true);
    expect(result.logs.join("\n")).toContain("bounce pass");
  });
});

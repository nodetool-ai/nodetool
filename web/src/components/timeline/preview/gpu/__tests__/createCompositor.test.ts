import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import { createCompositor } from "../createCompositor";

/**
 * Minimal fake canvas: vends a stub 2D context and refuses WebGPU, so the
 * factory exercises its fallback path without a real GPU. jsdom's own
 * `<canvas>` returns null for every `getContext`, which would also fall back
 * — but a stub lets us assert the Canvas2D path actually initialises.
 */
function fakeCanvas(): HTMLCanvasElement {
  const ctx2d = {
    setTransform() {},
    fillRect() {},
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    clip() {},
    fillStyle: "",
    filter: "none",
    globalAlpha: 1,
    globalCompositeOperation: "source-over"
  };
  return {
    width: 320,
    height: 180,
    getContext: (type: string) => (type === "2d" ? ctx2d : null)
  } as unknown as HTMLCanvasElement;
}

describe("createCompositor", () => {
  const originalGpu = (navigator as { gpu?: unknown }).gpu;

  beforeEach(() => {
    // Ensure WebGPU looks unavailable regardless of the host environment.
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "gpu", {
      value: originalGpu,
      configurable: true
    });
  });

  it("falls back to the Canvas2D backend when WebGPU is unavailable", async () => {
    const { backend, init, compositor } = await createCompositor(fakeCanvas());
    expect(backend).toBe("canvas2d");
    expect(init.ok).toBe(true);
    // The fallback compositor honours the shared interface.
    expect(typeof compositor.render).toBe("function");
    compositor.dispose();
  });

  it("reports failure when neither backend can initialise", async () => {
    const blankCanvas = {
      width: 10,
      height: 10,
      getContext: () => null
    } as unknown as HTMLCanvasElement;
    const { backend, init } = await createCompositor(blankCanvas);
    expect(backend).toBe("canvas2d");
    expect(init.ok).toBe(false);
  });
});

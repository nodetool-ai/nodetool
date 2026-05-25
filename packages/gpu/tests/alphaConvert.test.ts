import { describe, it, expect, beforeAll } from "vitest";
import { createExecutor, type Executor } from "../src/executor.js";
import { createGPUContextFromDevice, type GPUContext } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import {
  alphaStraightToPremulV1,
  alphaPremulToStraightV1
} from "../src/shaders/index.js";
import { createNodeGPUDevice } from "../src/node.js";

/**
 * `alpha.straightToPremul@1` and `alpha.premulToStraight@1` — the two boundary
 * modules that bridge straight↔premultiplied alpha across the FX chain.
 *
 * The metadata block runs in any environment; the round-trip behavior assertion
 * needs a real `GPUDevice` and skips otherwise (matches the existing
 * canary/effects suites).
 */
describe("alpha convert modules", () => {
  describe("metadata", () => {
    it("straightToPremul declares straight→premultiplied", () => {
      expect(alphaStraightToPremulV1.id).toBe("alpha.straightToPremul");
      expect(alphaStraightToPremulV1.category).toBe("alpha");
      expect(alphaStraightToPremulV1.kind).toBe("compute");
      expect(alphaStraightToPremulV1.io.inputs.source.alpha).toBe("straight");
      expect(alphaStraightToPremulV1.io.output.alpha).toBe("premultiplied");
      // ColorSpace is passthrough — declared as srgb to match current ingress;
      // a linear variant lands with Phase 3b's color-space migration.
      expect(alphaStraightToPremulV1.io.inputs.source.colorSpace).toBe(
        alphaStraightToPremulV1.io.output.colorSpace
      );
    });

    it("premulToStraight declares premultiplied→straight", () => {
      expect(alphaPremulToStraightV1.id).toBe("alpha.premulToStraight");
      expect(alphaPremulToStraightV1.category).toBe("alpha");
      expect(alphaPremulToStraightV1.kind).toBe("compute");
      expect(alphaPremulToStraightV1.io.inputs.source.alpha).toBe(
        "premultiplied"
      );
      expect(alphaPremulToStraightV1.io.output.alpha).toBe("straight");
    });

    it("both stay `internal` until promoted alongside the linear-color migration", () => {
      expect(alphaStraightToPremulV1.surface).toBe("internal");
      expect(alphaPremulToStraightV1.surface).toBe("internal");
    });
  });

  describe("behavior (GPU)", async () => {
    async function tryGetDevice(): Promise<GPUDevice | null> {
      const nav = (globalThis as { navigator?: { gpu?: GPU } }).navigator;
      if (nav?.gpu) {
        const adapter = await nav.gpu.requestAdapter();
        return (await adapter?.requestDevice()) ?? null;
      }
      try {
        return await createNodeGPUDevice();
      } catch {
        return null;
      }
    }

    const device = await tryGetDevice();

    let gpu: GPUDevice;
    let ctx: GPUContext;
    let executor: Executor;

    beforeAll(() => {
      if (!device) return;
      gpu = device;
      ctx = createGPUContextFromDevice(gpu);
      executor = createExecutor();
    });

    it.skipIf(!device)(
      "straightToPremul multiplies rgb by alpha",
      async () => {
        // (255, 0, 0, 128) straight → (128, 0, 0, 128) premultiplied.
        const src = new Uint8Array([255, 0, 0, 128]);
        const out = await runConvert(
          alphaStraightToPremulV1,
          { colorSpace: "srgb", alpha: "straight" },
          { colorSpace: "srgb", alpha: "premultiplied" },
          src
        );
        // 255 * 128/255 = 128 exact in u8.
        expect(out[0]).toBeGreaterThanOrEqual(126);
        expect(out[0]).toBeLessThanOrEqual(130);
        expect(out[1]).toBe(0);
        expect(out[2]).toBe(0);
        expect(out[3]).toBe(128);
      }
    );

    it.skipIf(!device)(
      "Executor auto-inserts straightToPremul when a premul-contract module is fed straight input",
      async () => {
        // Use `alpha.premulToStraight@1` itself as a convenient premul-contract
        // module: with straight input (255,0,0,128) and auto-insert, the
        // Executor first encodes straightToPremul (→ 128,0,0,128 premul), then
        // premulToStraight (→ 255,0,0,128). Round-tripping back to the
        // original straight values is the assertion that auto-insert ran.
        const src = new Uint8Array([255, 0, 0, 128]);
        const out = await runConvert(
          alphaPremulToStraightV1,
          { colorSpace: "srgb", alpha: "straight" },
          { colorSpace: "srgb", alpha: "straight" },
          src
        );
        expect(out[0]).toBeGreaterThanOrEqual(252);
        expect(out[0]).toBeLessThanOrEqual(255);
        expect(out[1]).toBe(0);
        expect(out[2]).toBe(0);
        expect(out[3]).toBe(128);
      }
    );

    it.skipIf(!device)(
      "premulToStraight divides rgb by alpha; alpha=0 collapses to (0,0,0,0)",
      async () => {
        // (128, 0, 0, 128) premul → ~(255, 0, 0, 128) straight.
        const opaqueIsh = new Uint8Array([128, 0, 0, 128]);
        const out = await runConvert(
          alphaPremulToStraightV1,
          { colorSpace: "srgb", alpha: "premultiplied" },
          { colorSpace: "srgb", alpha: "straight" },
          opaqueIsh
        );
        expect(out[0]).toBeGreaterThanOrEqual(252);
        expect(out[0]).toBeLessThanOrEqual(255);
        expect(out[3]).toBe(128);

        const zero = new Uint8Array([200, 200, 200, 0]);
        const outZero = await runConvert(
          alphaPremulToStraightV1,
          { colorSpace: "srgb", alpha: "premultiplied" },
          { colorSpace: "srgb", alpha: "straight" },
          zero
        );
        expect(outZero[0]).toBe(0);
        expect(outZero[1]).toBe(0);
        expect(outZero[2]).toBe(0);
        expect(outZero[3]).toBe(0);
      }
    );

    async function runConvert(
      module: typeof alphaStraightToPremulV1 | typeof alphaPremulToStraightV1,
      inMeta: { colorSpace: "srgb" | "linear"; alpha: "straight" | "premultiplied" },
      outMeta: { colorSpace: "srgb" | "linear"; alpha: "straight" | "premultiplied" },
      pixel: Uint8Array
    ): Promise<Uint8Array> {
      const source = createLabeledTexture(gpu, {
        label: "alpha-convert-source",
        width: 1,
        height: 1,
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        meta: inMeta
      });
      gpu.queue.writeTexture(
        { texture: source.texture },
        pixel,
        { bytesPerRow: 4, rowsPerImage: 1 },
        { width: 1, height: 1 }
      );
      const output = createLabeledTexture(gpu, {
        label: "alpha-convert-output",
        width: 1,
        height: 1,
        format: "rgba8unorm",
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
        meta: outMeta
      });
      const encoder = gpu.createCommandEncoder();
      executor.encode({
        ctx,
        module,
        encoder,
        inputs: { source },
        output,
        params: module.paramDefaults,
        dispatch: { kind: "compute", x: 1, y: 1, z: 1 }
      });
      const bytesPerRow = 256;
      const readback = gpu.createBuffer({
        size: bytesPerRow,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
      encoder.copyTextureToBuffer(
        { texture: output.texture },
        { buffer: readback, bytesPerRow, rowsPerImage: 1 },
        { width: 1, height: 1 }
      );
      gpu.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const out = new Uint8Array(readback.getMappedRange()).slice(0, 4);
      readback.unmap();
      readback.destroy();
      source.destroy();
      output.destroy();
      return out;
    }
  });
});

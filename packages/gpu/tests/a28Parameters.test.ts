import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import * as d from "typegpu/data";
import type { ShaderModule } from "../src/module.js";
import type { RecipeModule } from "../src/recipe.js";
import { createRecipeRunner } from "../src/recipe.js";
import { createDefaultRegistry } from "../src/pool.js";
import { createExecutor } from "../src/executor.js";
import { getNodeGPUDevice } from "../src/node.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture, type LabeledTexture } from "../src/texture.js";

type Module = ShaderModule | RecipeModule;
const root = new URL("../src/shaders/", import.meta.url);
async function catalog(): Promise<Module[]> {
  const result: Module[] = [];
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" }).map(file => file.replaceAll("\\", "/")).filter(f => f.endsWith("/module.ts")).sort()) {
    for (const value of Object.values(await import(fileURLToPath(new URL(file, root))))) {
      if (typeof value === "object" && value !== null && ("wgsl" in value || "recipe" in value)) {
        result.push(value as unknown as Module);
      }
    }
  }
  return result;
}
function half(word: number): number {
  const e = (word >> 10) & 31, f = word & 1023;
  return (word & 32768 ? -1 : 1) * (e === 31 ? (f ? NaN : Infinity) : e === 0 ? f * 2 ** -24 : (1 + f / 1024) * 2 ** (e - 15));
}
// Inputs are exactly representable in both formats only at endpoints. Round to
// binary16 explicitly so this audit includes the real promotion error.
function bits(value: number): number {
  if (value === 0) return 0;
  const e = Math.floor(Math.log2(value));
  if (e < -14) return Math.round(value * 2 ** 24);
  return (e + 15) * 1024 + Math.round((value / 2 ** e - 1) * 1024);
}
function cases(module: Module): Array<{ name: string; params: typeof module.paramDefaults }> {
  const result = [{ name: "default", params: module.paramDefaults }];
  for (const [key, hint] of Object.entries(module.paramUi ?? {})) {
    if (typeof module.paramDefaults[key] !== "number") continue;
    for (const value of [hint.min, hint.max]) {
      if (value !== undefined && value !== module.paramDefaults[key]) result.push({ name: `${key}=${value}`, params: { ...module.paramDefaults, [key]: value } });
    }
  }
  for (const [key, value] of Object.entries(module.paramDefaults)) {
    if (key.startsWith("domain") || key.startsWith("row")) continue;
    if (typeof value !== "object" || value === null || !("x" in value)) continue;
    const vector = "w" in value ? d.vec4f(0, 1, 0, 1) : "z" in value ? d.vec3f(0, 1, 0) : d.vec2f(0, 1);
    result.push({ name: `${key}=vector`, params: { ...module.paramDefaults, [key]: vector } });
  }
  const extras: Record<string, Record<string, unknown>[]> = {
    "color.cdl": [{ slopeR: 4, offsetG: -1, powerB: 0.1, saturation: 4 }],
    "color.curves": [{ blackPoint: 0.2, whitePoint: 0.8, shadows: -1, midtones: 1, highlights: -1 }],
    "color.curveTransfer": [{ table: Array.from({length: 256}, (_, i) => d.vec4f(1-i/255, (i/255)**2, i/255, 1)) }],
    "color.liftGammaGain": [{ liftR: -1, liftMaster: 0.5, gammaG: 0.1, gainB: 4 }],
    "color.filmLook": [{ shadow: d.vec3f(1,0,1), highlight: d.vec3f(0,1,0), contrast: 4, saturation: 4, fade: 1, intensity: 1 }],
    "color.splitToning": [{ shadowColor: d.vec3f(1,0,1), shadowSat: 1, highlightColor: d.vec3f(0,1,0), highlightSat: 1, balance: -1 }],
    "color.secondary": [{ hueWidth: 360, hueShift: 180, saturation: 4, lightness: 1 }, { hueWidth: 360, saturation: 0, lightness: -1 }],
    "color.cubeLut": [{ intensity: 0.5, domainMin: d.vec4f(0.1,0.1,0.1,0), domainMax: d.vec4f(0.9,0.9,0.9,0) }],
    "filters.convolve3x3": [{ row0: d.vec4f(0,-1,0,0), row1: d.vec4f(-1,5,-1,0), row2: d.vec4f(0,-1,0,1) }],
    "filters.deband": [{ strength: 1, range: 32, threshold: 1, dither: 1 }],
    "filters.denoise.spatial": [{ lumaStrength: 1, chromaStrength: 1, radius: 4 }],
    "filters.denoise.temporal": [{ strength: 1 }],
    "filters.sharpen.combine": [{ amount: 2, threshold: 0 }],
    "filters.visualFx": Array.from({length: 22}, (_, mode) => ({ mode, amount: 1, scale: 2, angle: 37, time: 0.4, seed: 7, softness: 0 })),
    "transform.affine": [{ m00: 0.8, m01: 0.2, tx: -0.15, m10: -0.2, m11: 0.8, ty: 0.1 }],
    "transform.cornerPin": [{ h00: 0.8, h01: 0.2, h02: -0.1, h10: -0.1, h11: 0.9, h12: 0.1, h20: 0.2, h21: -0.1 }],
    "transform.stabilize": [{ a: 0.8, b: 0.2, x: -0.1, c: -0.2, e: 0.8, y: 0.1 }]
  };
  for (const [index, params] of (extras[module.id] ?? []).entries()) result.push({ name: `authored-${index}`, params: { ...module.paramDefaults, ...params } });
  return result;
}
it("audits parameter endpoints, spatial edges and transparent pixels per module", async () => {
  const device = await getNodeGPUDevice();
  const adapter = { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device, description: device.adapterInfo.description };
  console.log("A28 adapter", adapter);
  const ctx = createGPUContextFromDevice(device), executor = createExecutor(), runner = createRecipeRunner(), registry = createDefaultRegistry();
  const results: object[] = [];
  const all = await catalog();
  expect(all.length).toBeGreaterThan(0);
  try {
    for (const module of all) {
      for (const test of cases(module)) {
        const outputs: number[][] = [];
        for (const format of ["rgba8unorm", "rgba16float"] as const) {
          const allocated: LabeledTexture[] = [];
          const outSize = module.id === "transform.resize" ? 23 : 16;
          const make = (fmt: GPUTextureFormat, alpha: "straight" | "premultiplied", colorSpace: typeof module.io.output.colorSpace, size = 16) => {
            const texture = createLabeledTexture(device, { width: size, height: size, format: fmt,
              usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT, meta: { alpha, colorSpace } });
            allocated.push(texture); return texture;
          };
          device.pushErrorScope("validation");
          const buffer = device.createBuffer({ size: 256 * outSize, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          try {
            const inputs = Object.fromEntries(Object.entries(module.io.inputs).map(([name, contract], slot) => {
              const texture = make(module.precision?.[name] === "fixed" ? (name === "lut" ? "rgba16float" : "rgba8unorm") : format, contract.alpha, contract.colorSpace);
              const values = Array.from({ length: 1024 }, (_, i) => {
                const pixel = Math.floor(i / 4), channel = i % 4;
                const alpha = [0, 1, 2, 128, 254, 255][Math.floor(pixel / 16) % 6] / 255;
                if (name === "mask") return 1;
                if (channel === 3) return alpha;
                const color = [0, 1, 2, 64, 128, 253, 254, 255][(pixel + channel + slot * 3) % 8] / 255;
                return Math.round(color * (contract.alpha === "premultiplied" ? alpha : 1) * 255) / 255;
              });
              device.queue.writeTexture({ texture: texture.texture }, texture.format === "rgba16float" ? Uint16Array.from(values, bits) : Uint8Array.from(values, v => Math.round(v * 255)), { bytesPerRow: texture.format === "rgba16float" ? 128 : 64 }, [16, 16]);
              return [name, texture];
            }));
            const output = make(module.precision?.output === "fixed" ? module.io.output.format : format, module.io.output.alpha, module.io.output.colorSpace, outSize);
            const encoder = device.createCommandEncoder();
            ctx.uniformRing.beginSubmission();
            if ("recipe" in module) runner.encode({ ctx, module, encoder, inputs, output, params: test.params, registry, workingFormat: format, executor });
            else executor.encode({ ctx, module, encoder, inputs, output, params: test.params, workingFormat: format, dispatch: module.kind === "compute" ? { kind: "compute", x: Math.ceil(16 / module.workgroupSize[0]), y: Math.ceil(16 / module.workgroupSize[1]) } : { kind: "fragment" } });
            encoder.copyTextureToBuffer({ texture: output.texture }, { buffer, bytesPerRow: 256 }, [outSize, outSize]);
            device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const words = output.format === "rgba16float" ? new Uint16Array(buffer.getMappedRange()) : new Uint8Array(buffer.getMappedRange());
            const values = Array.from({ length: outSize * outSize * 4 }, (_, i) => {
              const word = words[Math.floor(i / (outSize * 4)) * (output.format === "rgba16float" ? 128 : 256) + i % (outSize * 4)];
              return output.format === "rgba16float" ? half(word) : word / 255;
            });
            outputs.push(values);
            buffer.unmap();
          } finally {
            buffer.destroy(); allocated.forEach(t => t.destroy());
            expect(await device.popErrorScope(), module.id).toBeNull();
          }
        }
        const values = outputs[1];
        const errors = values.map((v, i) => Math.abs(Math.min(1, Math.max(0, v)) - outputs[0][i]) * 255);
        const result = { id: `${module.id}@${module.version}`, case: test.name, min: Math.min(...values), max: Math.max(...values), nonfinite: values.filter(v => !Number.isFinite(v)).length, maxError: Math.max(...errors), meanError: errors.reduce((a,b) => a+b,0)/errors.length };
        results.push({ ...result, byte: outputs[0], float: values });
        if (module.id === "color.posterize") {
          expect.soft(result.maxError, JSON.stringify(result)).toBeLessThanOrEqual(1);
          if (test.params.levels === 2) {
            // r=127/255 and a=254/255 promote to an exact ratio of 1/2.
            // floor((r/a)*2)/(2-1) is 1, then premultiplication restores a.
            expect.soft(values[(4 * 16 + 4) * 4], "exact half-intensity bin").toBe(half(bits(254 / 255)));
          }
        }
        expect.soft(result.nonfinite, JSON.stringify(result)).toBe(0);
        expect.soft(result.min, JSON.stringify(result)).toBeGreaterThanOrEqual(0);
        expect.soft(result.max, JSON.stringify(result)).toBeLessThanOrEqual(1);
        // Compatibility metric, not a float precision oracle. Includes recipe
        // intermediate quantization. Same three-code mean as timeline parity.
        expect.soft(result.meanError, JSON.stringify(result)).toBeLessThanOrEqual(3);
        if (module.id === "transform.resize" && test.params.mode === 0) {
          // An exact half-width UV hits a byte-path raster interpolation tie
          // on lavapipe. Judge nearest geometry against integer texel centers,
          // independently of either GPU target format.
          const geometryErrors = values.map((v, i) => {
            const x = Math.floor(((Math.floor(i / 4) % 23) + 0.5) * 16 / 23);
            const y = Math.floor((Math.floor(i / 92) + 0.5) * 16 / 23);
            const channel = i % 4;
            const alpha = [0,1,2,128,254,255][y % 6] / 255;
            const color = [0,1,2,64,128,253,254,255][(y * 16 + x + channel) % 8] / 255;
            const expected = channel === 3 ? alpha : Math.round(color * alpha * 255) / 255;
            return Math.abs(v - expected) * 255;
          });
          expect.soft(Math.max(...geometryErrors), "nearest texel-center oracle").toBeLessThanOrEqual(2);
        } else if (module.id.startsWith("transform.")) {
          expect.soft(result.maxError, JSON.stringify(result)).toBeLessThanOrEqual(2);
        }
      }
    }
  } finally {
    ctx.scratch.dispose();
    if (process.env.A28_OUTPUT) writeFileSync(process.env.A28_OUTPUT, JSON.stringify({ adapter, results }, null, 2));
    console.log("A28 cases", results.length);
  }
}, 240000);

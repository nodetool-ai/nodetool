import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import type { ShaderModule } from "../src/module.js";

const root = new URL("../src/shaders/", import.meta.url);
export async function modules(): Promise<ShaderModule[]> {
  const result: ShaderModule[] = [];
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" }).filter(f => f.endsWith("/module.ts")).sort()) {
    const exports = await import(fileURLToPath(new URL(file, root)));
    for (const value of Object.values(exports)) {
      if (typeof value === "object" && value !== null && "wgsl" in value) {
        // Dynamic module exports are narrowed by their shader payload.
        result.push(value as unknown as ShaderModule);
      }
    }
  }
  expect(result.length).toBeGreaterThan(0);
  return result;
}
it("preserves every resolved RGBA8 shader byte for byte", async () => {
  const actual = Object.fromEntries((await modules()).map(m => [`${m.id}@${m.version}`, m.wgsl]));
  const path = new URL("./fixtures/rgba8-wgsl.json", import.meta.url);
  expect(actual).toEqual(JSON.parse(readFileSync(path, "utf8")));
}, 60000);

import { resolveWorkingModule, validatePrecisionSlots, validateWorkingOutput } from "../src/workingFormat.js";
import { createExecutor } from "../src/executor.js";
import { createRecipeRunner, type RecipeModule } from "../src/recipe.js";
import { createDefaultRegistry } from "../src/pool.js";
import { getNodeGPUDevice } from "../src/node.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture, type LabeledTexture } from "../src/texture.js";
import { checkRenderTexture } from "../src/resourceValidation.js";

async function recipes(): Promise<RecipeModule[]> {
  const result: RecipeModule[] = [];
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" }).filter(f => f.endsWith("/module.ts"))) {
    const exports = await import(fileURLToPath(new URL(file, root)));
    for (const value of Object.values(exports)) {
      if (typeof value === "object" && value !== null && "recipe" in value) {
        result.push(value as unknown as RecipeModule);
      }
    }
  }
  return result;
}
const inventory = readFileSync(new URL("../../../docs/plans/color-precision/results/a97-transfer-inventory.md", import.meta.url), "utf8");
function checkInventory(modules: readonly (ShaderModule | RecipeModule)[]): void {
  const expected = inventory.split("\n").filter(line => /^\| [^|]+\/module\.ts \|/.test(line))
    .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()));
  const actual: string[] = [];
  for (const module of modules) {
    validatePrecisionSlots(module);
    for (const [slot, policy] of Object.entries(module.precision ?? {})) {
      actual.push(`${module.id}@${module.version}:${slot}:${policy}`);
    }
  }
  const intermediates = Object.fromEntries(modules.filter(m => "recipe" in m).map(m => {
    if (!("recipe" in m)) throw new Error("Expected recipe");
    return [m.id, Object.fromEntries(Object.entries(m.recipe.intermediates).map(([name, spec]) =>
      [name, { precision: spec.precision, role: spec.role ?? null, format: spec.format }]))];
  }));
  const colour = { precision: "working", role: null, format: "rgba8unorm" };
  const mask = { precision: "fixed", role: "mask", format: "rgba8unorm" };
  expect(intermediates).toEqual({
    "filters.glow": { bright: colour, blurH: colour, blurV: colour },
    "filters.blur.gaussianSeparable": { blurH: colour },
    "filters.sharpen.gaussian": { horizontal: colour, blurred: colour },
    "mixer.dropShadow": { mask, blurH: mask, blurV: mask }
  });
  expect(actual.length).toBeGreaterThan(0);
  expect(actual.sort()).toEqual(expected.map(([, id, slot, role]) =>
    `${id}:${slot}:${role === "colour/mask" ? "working-or-mask" : role === "colour" && !id.startsWith("sources.") ? "working" : "fixed"}`).sort());
}
it("classifies the complete A97 slot set and rejects deliberately wrong modules", async () => {
  const shaders = await modules();
  const all = [...shaders, ...await recipes()];
  checkInventory(all);
  const first = shaders[0];
  expect(() => checkInventory([...all, { ...first, id: "unclassified" }])).toThrow();
  expect(() => validatePrecisionSlots({ ...first, precision: undefined })).toThrow("unclassified");
  expect(() => checkInventory(all.map(m => m === first ? { ...m, precision: { ...m.precision, output: "fixed" } } : m))).toThrow();
  expect(() => validateWorkingOutput(first, "rgba16float", "rgba8unorm")).toThrow("fixed-byte working slot");
  for (const module of shaders) {
    expect(resolveWorkingModule(module, "rgba8unorm")).toBe(module);
    const fp16 = resolveWorkingModule(module, "rgba16float");
    expect(fp16.wgsl).toBe((module.workingWgsl ?? module.wgsl).replaceAll(
      "texture_storage_2d<rgba8unorm", module.precision?.output === "fixed" ? "texture_storage_2d<rgba8unorm" : "texture_storage_2d<rgba16float"));
  }
}, 60000);

it("dispatches every shader and recipe in both formats on one pipeline cache", async () => {
  const device = await getNodeGPUDevice();
  process.stderr.write(`catalog adapter: ${JSON.stringify({ vendor: device.adapterInfo.vendor, architecture: device.adapterInfo.architecture, device: device.adapterInfo.device, description: device.adapterInfo.description })}\n`);
  const ctx = createGPUContextFromDevice(device);
  const executor = createExecutor();
  const runner = createRecipeRunner();
  const registry = createDefaultRegistry();
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING |
    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
  await checkRenderTexture(device, 4, 4, "rgba16float", usage);
  const all = [...await modules(), ...await recipes()];
  try {
    for (const module of all) {
      let bytePipeline: GPURenderPipeline | GPUComputePipeline | undefined;
      for (const workingFormat of ["rgba8unorm", "rgba16float", "rgba8unorm"] as const) {
        const allocated: LabeledTexture[] = [];
        const make = (format: GPUTextureFormat, alpha: "straight" | "premultiplied", colorSpace: typeof module.io.output.colorSpace) => {
          const t = createLabeledTexture(device, { width: 4, height: 4, format, usage, meta: { alpha, colorSpace } });
          allocated.push(t);
          return t;
        };
        device.pushErrorScope("validation");
        try {
          const inputs = Object.fromEntries(Object.entries(module.io.inputs).map(([name, contract]) => [
            name, make(module.precision?.[name] === "fixed" ? (name === "lut" ? "rgba16float" : "rgba8unorm") : workingFormat, contract.alpha, contract.colorSpace)
          ]));
          for (const input of Object.values(inputs)) {
            const data = input.format === "rgba16float"
              ? new Uint16Array(64).map((_, i) => [0x3400, 0x3800, 0x3a00, 0x3c00][i % 4])
              : new Uint8Array(64).map((_, i) => [64, 128, 192, 255][i % 4]);
            device.queue.writeTexture({ texture: input.texture }, data, { bytesPerRow: input.format === "rgba16float" ? 32 : 16 }, [4, 4]);
          }
          const output = make(module.precision?.output === "fixed" ? module.io.output.format : workingFormat, module.io.output.alpha, module.io.output.colorSpace);
          const encoder = device.createCommandEncoder();
          ctx.uniformRing.beginSubmission();
          if ("recipe" in module) {
            runner.encode({ ctx, module, encoder, inputs, output, params: module.paramDefaults, registry, workingFormat, executor });
          } else {
            executor.encode({ ctx, module, encoder, inputs, output, params: module.paramDefaults, workingFormat,
              dispatch: module.kind === "compute" ? { kind: "compute", x: 1, y: 1 } : { kind: "fragment" } });
          }
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          expect(output.contentVersion, module.id).toBeGreaterThan(0);
          if (workingFormat === "rgba16float" && output.format === "rgba16float") {
            const buffer = device.createBuffer({ size: 1024, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            try {
              const read = device.createCommandEncoder();
              read.copyTextureToBuffer({ texture: output.texture }, { buffer, bytesPerRow: 256 }, [4, 4]);
              device.queue.submit([read.finish()]);
              await buffer.mapAsync(GPUMapMode.READ);
              const words = new Uint16Array(buffer.getMappedRange());
              const values: number[] = [];
              for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
                const word = words[y * 128 + x];
                const exponent = (word >> 10) & 31, fraction = word & 1023;
                values.push((word & 0x8000 ? -1 : 1) * (exponent === 31 ? (fraction ? NaN : Infinity) : exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15)));
              }
              process.stderr.write(`catalog ${module.id}@${module.version}: min=${Math.min(...values)} max=${Math.max(...values)} nonfinite=${values.filter(v => !Number.isFinite(v)).length}\n`);
              expect(values.every(Number.isFinite), module.id).toBe(true);
              buffer.unmap();
            } finally { buffer.destroy(); }
          }

          if (!("recipe" in module) && output.format === "rgba8unorm") {
            const pipeline = ctx.pipelineCache.get(`${module.id}@${module.version}:${module.kind}:rgba8unorm`);
            expect(pipeline).toBeDefined();
            if (bytePipeline) expect(pipeline).toBe(bytePipeline);
            bytePipeline = pipeline;
          }
        } finally {
          allocated.forEach(t => t.destroy());
          expect(await device.popErrorScope(), `${module.id} ${workingFormat}`).toBeNull();
        }
      }
    }
  } finally {
    ctx.scratch.dispose();
  }
}, 120000);

it("keeps low alpha in FP16 automatic conversion and rejects byte working inputs", async () => {
  const device = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(device);
  const module = (await modules()).find(m => m.id === "_canary.passthrough");
  if (!module) throw new Error("Missing canary");
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT;
  const source = createLabeledTexture(device, { width: 1, height: 1, format: "rgba16float", usage, meta: { alpha: "straight" } });
  const output = createLabeledTexture(device, { width: 1, height: 1, format: "rgba16float", usage });
  const bytes = createLabeledTexture(device, { width: 1, height: 1, format: "rgba8unorm", usage });
  const readback = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  device.pushErrorScope("validation");
  try {
    device.queue.writeTexture({ texture: source.texture }, new Uint16Array([0x3800, 0x3400, 0, 0x1400]), { bytesPerRow: 8 }, [1, 1]);
    const executor = createExecutor();
    const encoder = device.createCommandEncoder();
    const args = { ctx, module, encoder, inputs: { source }, output, params: module.paramDefaults, workingFormat: "rgba16float" as const, dispatch: { kind: "fragment" as const } };
    expect(() => executor.encode({ ...args, inputs: { source: bytes } })).toThrow("fixed-byte working input");
    executor.encode(args);
    encoder.copyTextureToBuffer({ texture: output.texture }, { buffer: readback, bytesPerRow: 256 }, [1, 1]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    expect([...new Uint16Array(readback.getMappedRange()).slice(0, 4)]).toEqual([0x1000, 0x0c00, 0, 0x1400]);
    readback.unmap();
  } finally {
    source.destroy(); output.destroy(); bytes.destroy(); readback.destroy(); ctx.scratch.dispose();
    expect(await device.popErrorScope()).toBeNull();
  }
}, 60000);

it("rejects a fixed-byte recipe intermediate before allocation or dispatch", async () => {
  const device = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(device);
  const glow = (await recipes()).find(m => m.id === "filters.glow");
  if (!glow) throw new Error("Missing glow");
  const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const texture = createLabeledTexture(device, { width: 1, height: 1, format: "rgba16float", usage });
  try {
    for (const slot of ["bright", "blurH"]) {
      const wrong = { ...glow, recipe: { ...glow.recipe, intermediates: {
        ...glow.recipe.intermediates,
        [slot]: { ...glow.recipe.intermediates[slot], precision: "fixed" as const }
      } } };
      expect(() => createRecipeRunner().encode({ ctx, module: wrong, encoder: device.createCommandEncoder(),
        inputs: { source: texture }, output: texture, params: wrong.paramDefaults,
        workingFormat: "rgba16float", registry: createDefaultRegistry(),
        executor: { encode() { throw new Error("Unexpected dispatch"); } }
      })).toThrow(`fixed-byte working slot ${slot}`);
    }
  } finally {
    texture.destroy(); ctx.scratch.dispose();
  }
}, 60000);

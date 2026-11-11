import { sourcePixels, type Scene } from "./fixtures/precisionScenes.js";
import { passthroughV1 } from "../src/shaders/_canary/passthrough/v1/module.js";
import inverseLevels from "./fixtures/inverse-levels.json" with { type: "json" };
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { expect, it } from "vitest";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { createGPUContextFromDevice } from "../src/context.js";
import { createExecutor } from "../src/executor.js";
import type { ShaderModule } from "../src/module.js";
import { getNodeGPUDevice } from "../src/node.js";
import { colorLevelsV1, colorGradeV1, filtersThresholdV1, mixerAddV1 } from "../src/pool.js";
import { colorExposureV1 } from "../src/shaders/color/exposure/v1/module.js";
import { blurGaussianV1 } from "../src/shaders/filters/blur/gaussian/v1/module.js";
import { vignetteV2 } from "../src/shaders/filters/vignette/v2/module.js";
import { createLabeledTexture, type LabeledTexture } from "../src/texture.js";

type Format = "rgba8unorm" | "rgba16float";
const artifactDir = process.env.COLOR_S0_OUTPUT;

// Only storage declarations change. Shader arithmetic remains f32 and needs no shader-f16.
function withFormat(module: ShaderModule, format: Format): ShaderModule {
  return {
    ...module,
    id: `${module.id}.s0.${format}`,
    wgsl: `// S0 storage ${format}\n${module.wgsl.replaceAll("rgba8unorm", format)}`,
    layout: tgpu.bindGroupLayout(Object.fromEntries(Object.entries(module.layout.entries).map(([key, entry]) =>
      [key, entry && "storageTexture" in entry ? { ...entry, storageTexture: format } : entry]))),
    io: { ...module.io, output: { ...module.io.output, format } }
  };
}

function half(value: number): number {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 31;
  const fraction = value & 1023;
  return sign * (exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15));
}

const levels = (gamma: number) => ({ ...colorLevelsV1.paramDefaults, rGamma: gamma, gGamma: gamma, bGamma: gamma });

async function render(scene: Scene, format: Format, width: number, height: number): Promise<Float32Array> {
  const gpu = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(gpu);
  const textures: LabeledTexture[] = [];
  const allocate = (fmt: Format) => {
    const texture = createLabeledTexture(gpu, { width, height, format: fmt,
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
    textures.push(texture);
    return texture;
  };
  const stride = Math.ceil(width * (format === "rgba8unorm" ? 4 : 8) / 256) * 256;
  const buffer = gpu.createBuffer({ size: stride * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  gpu.pushErrorScope("validation");
  try {
    const source = allocate("rgba8unorm");
    gpu.queue.writeTexture({ texture: source.texture }, sourcePixels(scene, width, height), { bytesPerRow: width * 4 }, { width, height });
    const encoder = gpu.createCommandEncoder();
    const executor = createExecutor();
    function pass(module: ShaderModule, input: LabeledTexture, params = module.paramDefaults, extra: Record<string, LabeledTexture> = {}): LabeledTexture {
      const output = allocate(format);
      const [wx, wy] = module.workgroupSize;
      executor.encode({ ctx, encoder, module, workingFormat: format, inputs: { source: input, ...extra }, output, params,
        dispatch: module.kind === "fragment" ? { kind: "fragment" } : { kind: "compute", x: Math.ceil(width / wx), y: Math.ceil(height / wy) } });
      return output;
    }
    let result = source;
    if (format === "rgba16float") {
      // Upload normalization only. All measured effects use the production
      // working-format executor below rather than test-local shader clones.
      result = allocate(format);
      executor.encode({ ctx, encoder, module: withFormat(passthroughV1, format),
        inputs: { source }, output: result, params: passthroughV1.paramDefaults,
        dispatch: { kind: "fragment" } });
    }
    if (scene === "ramp") {
      for (const gamma of inverseLevels.gammas) {
        result = pass(colorLevelsV1, result, levels(gamma));
      }
    }
    if (scene === "dark-fade") {
      result = pass(colorExposureV1, result, { stops: -5 });
      result = pass(colorExposureV1, result, { stops: 5 });
    }
    if (scene === "sky") {
      result = pass(vignetteV2, result, { ...vignetteV2.paramDefaults, intensity: 0.65 });
      result = pass(blurGaussianV1, result, { radius: 6, sigma: 0, direction: d.vec2f(1, 0) });
      result = pass(blurGaussianV1, result, { radius: 6, sigma: 0, direction: d.vec2f(0, 1) });
    }
    if (scene === "grade-glow") {
      for (const brightness of [-0.025, 0.035, -0.015, 0.02]) {
        result = pass(colorGradeV1, result, { ...colorGradeV1.paramDefaults, brightness, contrast: 1.03, saturation: 1.04, temperature: 0.03 });
      }
      const base = result;
      result = pass(filtersThresholdV1, result, { threshold: 0.55, softness: 0.15 });
      result = pass(blurGaussianV1, result, { radius: 12, sigma: 0, direction: d.vec2f(1, 0) });
      result = pass(blurGaussianV1, result, { radius: 12, sigma: 0, direction: d.vec2f(0, 1) });
      result = pass(mixerAddV1, base, { gain: 0.65, tint: d.vec3f(1, 0.85, 0.7) }, { over: result });
    }
    encoder.copyTextureToBuffer({ texture: result.texture }, { buffer, bytesPerRow: stride }, { width, height });
    gpu.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const view = new DataView(buffer.getMappedRange());
    const values = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width * 4; x++) {
        values[y * width * 4 + x] = format === "rgba8unorm" ? view.getUint8(y * stride + x) / 255 : half(view.getUint16(y * stride + x * 2, true));
      }
    }
    const error = await gpu.popErrorScope();
    expect(error?.message ?? null).toBeNull();
    expect(values.every(Number.isFinite)).toBe(true);
    expect(values.every((value, i) => i % 4 !== 3 || value === 1)).toBe(true);
    return values;
  } finally {
    buffer.destroy();
    for (const texture of textures) texture.destroy();
    ctx.uniformRing.dispose(); ctx.scratch.dispose();
  }
}

// Identical delivery quantizer for both formats. No transfer change, alpha is opaque.
function delivery(values: Float32Array, dither: boolean): Uint8Array {
  return Uint8Array.from(values, (value, i) => {
    let hash = (i >> 2) ^ 0x9e3779b9;
    hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
    hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
    const noise = dither && i % 4 !== 3 ? ((hash ^ (hash >>> 15)) >>> 0) / 2 ** 32 - 0.5 : 0;
    return Math.max(0, Math.min(255, Math.round(value * 255 + noise)));
  });
}

// Dependency-free lossless PNG writer keeps the experiment inside the GPU package.
function png(width: number, height: number, pixels: Uint8Array): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name), body = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

it("recovers all 256 diagnostic levels with FP16 and no dithering", async () => {
  const result = delivery(await render("ramp", "rgba16float", 256, 1), false);
  const baseline = delivery(await render("ramp", "rgba8unorm", 256, 1), false);
  const baselineRed = Array.from({ length: 256 }, (_, x) => baseline[x * 4]!);
  const red = Array.from({ length: 256 }, (_, x) => result[x * 4]!);
  expect(new Set(red).size).toBe(inverseLevels.fp16Requirements.distinct);
  expect(Math.max(...red.map((v, x) => Math.abs(v - inverseLevels.referenceCodes[x]!)))).toBeLessThanOrEqual(inverseLevels.fp16Requirements.maximumCodeError);
  expect(red.every((v, x) => x === 0 || v >= red[x - 1]!)).toBe(true);
  if (artifactDir) {
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "diagnostic.json"), JSON.stringify({ rgba8: { distinct: new Set(baselineRed).size, maximumCodeError: Math.max(...baselineRed.map((v, x) => Math.abs(v - x))) }, distinct: new Set(red).size, maximumCodeError: Math.max(...red.map((v, x) => Math.abs(v - x))) }));
  }
}, 30_000);

it("compares three SDR scenes through identical shared effect chains", async () => {
  const gpu = await getNodeGPUDevice();
  const reports = [];
  for (const scene of ["dark-fade", "sky", "grade-glow"] as const) {
    const width = 768, height = 432;
    const low = await render(scene, "rgba8unorm", width, height);
    const high = await render(scene, "rgba16float", width, height);
    let square = 0, max = 0;
    for (let i = 0; i < low.length; i++) {
      if (i % 4 === 3) continue;
      const delta = Math.abs(low[i]! - high[i]!) * 255;
      square += delta * delta; max = Math.max(max, delta);
    }
    const finals = [];
    for (const dither of [false, true]) {
      const a = delivery(low, dither), b = delivery(high, dither);
      let changed = 0, maximum = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
        for (let c = 0; c < 3; c++) maximum = Math.max(maximum, Math.abs(a[i + c]! - b[i + c]!));
      }
      const source = sourcePixels(scene, width, height);
      const identityError = (pixels: Uint8Array) => {
        let maximum = 0, total = 0;
        for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) {
          const error = Math.abs(pixels[i] - source[i]);
          maximum = Math.max(maximum, error); total += error;
        }
        return { maximum, mean: total / (width * height * 3) };
      };
      // The dark fade is an inverse exposure pair, so its independent ideal
      // is the source. Other scenes deliberately change colour.
      const identity = scene === "dark-fade" ? { byte: identityError(a), float: identityError(b) } : undefined;
      if (identity) expect(identity.float.maximum).toBeLessThanOrEqual(1);
      finals.push({ dither, changedPixels: changed, maximumCodeDelta: maximum, identity });
      if (artifactDir) {
        await mkdir(artifactDir, { recursive: true });
        for (const [label, pixels] of [["rgba8", a], ["fp16", b]] as const) {
          await writeFile(join(artifactDir, `${scene}-${label}-${dither ? "dither" : "undithered"}.png`), png(width, height, pixels));
        }
      }
    }
    const working = { rmsCodeDelta: Math.sqrt(square / (width * height * 3)), maximumCodeDelta: max };
    expect(working.rmsCodeDelta).toBeGreaterThan(0);
    reports.push({ scene, width, height, working, finals });
  }
  const info = gpu.adapterInfo;
  const report = { adapter: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description }, shaderF16Enabled: gpu.features.has("shader-f16"), reports };

  if (artifactDir) await writeFile(join(artifactDir, "measurements.json"), JSON.stringify(report, null, 2));
}, 120_000);

it("keeps compute pipelines compatible when a module id uses both storage formats", async () => {
  const device = await getNodeGPUDevice();
  const ctx = createGPUContextFromDevice(device);
  const executor = createExecutor();
  const textures: LabeledTexture[] = [];
  device.pushErrorScope("validation");
  try {
    const allocate = (format: Format) => {
      const texture = createLabeledTexture(device, { width: 1, height: 1, format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
      textures.push(texture);
      return texture;
    };
    const input = allocate("rgba8unorm");
    const encoder = device.createCommandEncoder();
    for (const format of ["rgba8unorm", "rgba16float"] as const) {
      const module = { ...withFormat(colorGradeV1, format), id: colorGradeV1.id };
      executor.encode({ ctx, encoder, module, inputs: { source: input }, output: allocate(format), params: module.paramDefaults,
        dispatch: { kind: "compute", x: 1, y: 1 } });
    }
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  } finally {
    for (const texture of textures) texture.destroy();
    ctx.scratch.dispose();
    ctx.uniformRing.dispose();
    expect((await device.popErrorScope())?.message ?? null).toBeNull();
  }
});

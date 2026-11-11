import { readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { createGPUContextFromDevice } from "../src/context.js";
import { createExecutor } from "../src/executor.js";
import type { ShaderModule } from "../src/module.js";
import { getNodeGPUDevice } from "../src/node.js";
import { colorGradeV1, filtersThresholdV1, mixerAddV1 } from "../src/pool.js";
import { blurGaussianV1 } from "../src/shaders/filters/blur/gaussian/v1/module.js";
import { createLabeledTexture } from "../src/texture.js";

type Format = "rgba8unorm" | "rgba16float";
// Only storage declarations change. Shader arithmetic remains f32 and needs no shader-f16.
function withFormat(module: ShaderModule, format: Format): ShaderModule {
  return {
    ...module,
    id: `${module.id}.s0.${format}`,
    wgsl: `// S0 storage ${format}\n${module.wgsl.replaceAll("rgba8unorm", format)}`,
    layout: tgpu.bindGroupLayout(
      Object.fromEntries(
        Object.entries(module.layout.entries).map(([key, entry]) => [
          key,
          entry && "storageTexture" in entry
            ? { ...entry, storageTexture: format }
            : entry
        ])
      )
    ),
    io: { ...module.io, output: { ...module.io.output, format } }
  };
}

const percentile = (values: number[], p: number): number =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]!;
const environment = () => ({
  load: loadavg(),
  availableKiB: Number(
    readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+)/)![1]
  ),
  rss: process.memoryUsage().rss
});
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("measures completed 4K eight-pass work when explicitly enabled", async () => {
  expect(percentile([20, 1, 2, 3], 0.95)).toBe(20);
  if (!process.env.COLOR_COST_OUTPUT) {
    return;
  }
  const before = environment();
  expect(before.load[0]).toBeLessThanOrEqual(6);
  expect(before.availableKiB).toBeGreaterThan(8 * 1024 * 1024);
  const started = performance.now();
  const gpu = await getNodeGPUDevice();
  const deviceMs = performance.now() - started;
  const adapter = gpu.adapterInfo;
  const adapterInfo = {
    vendor: adapter.vendor,
    architecture: adapter.architecture,
    device: adapter.device,
    description: adapter.description
  };
  if (process.env.COLOR_COST_HARDWARE) {
    expect(adapter.vendor.toLowerCase()).toMatch(/nvidia|10de/);
  }
  let liveTextures = 0,
    liveBuffers = 0,
    textureAllocations = 0,
    bufferAllocations = 0;
  const createTexture = gpu.createTexture.bind(gpu),
    createBuffer = gpu.createBuffer.bind(gpu);
  gpu.createTexture = (descriptor) => {
    const texture = createTexture(descriptor);
    liveTextures++;
    textureAllocations++;
    const destroy = texture.destroy.bind(texture);
    let alive = true;
    texture.destroy = () => {
      if (alive) {
        liveTextures--;
        alive = false;
      }
      destroy();
    };
    return texture;
  };
  gpu.createBuffer = (descriptor) => {
    const buffer = createBuffer(descriptor);
    liveBuffers++;
    bufferAllocations++;
    const destroy = buffer.destroy.bind(buffer);
    let alive = true;
    buffer.destroy = () => {
      if (alive) {
        liveBuffers--;
        alive = false;
      }
      destroy();
    };
    return buffer;
  };
  const resources = () => ({
    liveTextures,
    liveBuffers,
    textureAllocations,
    bufferAllocations
  });
  const rejected: object[] = [];
  async function quiet() {
    for (let attempt = 0; attempt < 120; attempt++) {
      const snapshot = environment();
      if (snapshot.load[0]! <= 6 && snapshot.availableKiB >= 8 * 1024 * 1024) {
        return snapshot;
      }
      rejected.push(snapshot);
      await pause(10000);
    }
    throw new Error("Machine did not become quiet");
  }
  const width = 3840,
    height = 2160;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = (i / 4) % 256;
    pixels[i + 1] = 90;
    pixels[i + 2] = 130;
    pixels[i + 3] = 255;
  }
  function setup(format: Format) {
    const start = performance.now();
    const ctx = createGPUContextFromDevice(gpu);
    const executor = createExecutor();
    const allocate = (format: Format) =>
      createLabeledTexture(gpu, {
        width,
        height,
        format,
        usage:
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
    const source = allocate("rgba8unorm");
    const targets = Array.from({ length: 8 }, () => allocate(format));
    const modules = [
      colorGradeV1,
      colorGradeV1,
      colorGradeV1,
      colorGradeV1,
      filtersThresholdV1,
      blurGaussianV1,
      blurGaussianV1,
      mixerAddV1
    ].map((module) => withFormat(module, format));
    const params = [-0.025, 0.035, -0.015, 0.02].map((brightness) => ({
      ...colorGradeV1.paramDefaults,
      brightness,
      contrast: 1.03,
      saturation: 1.04,
      temperature: 0.03
    }));
    const allocationMs = performance.now() - start;
    async function upload() {
      const start = performance.now();
      gpu.queue.writeTexture(
        { texture: source.texture },
        pixels,
        { bytesPerRow: width * 4 },
        { width, height }
      );
      await gpu.queue.onSubmittedWorkDone();
      return performance.now() - start;
    }
    async function frame() {
      const start = performance.now();
      ctx.uniformRing.beginSubmission();
      const encoder = gpu.createCommandEncoder();
      for (let i = 0; i < 8; i++) {
        const module = modules[i]!;
        const input =
          i === 0 ? source : i === 7 ? targets[3]! : targets[i - 1]!;
        const parameters =
          i < 4
            ? params[i]!
            : i === 4
              ? { threshold: 0.55, softness: 0.15 }
              : i < 7
                ? {
                    radius: 12,
                    sigma: 0,
                    direction: d.vec2f(i === 5 ? 1 : 0, i === 6 ? 1 : 0)
                  }
                : { gain: 0.65, tint: d.vec3f(1, 0.85, 0.7) };
        const [wx, wy] = module.workgroupSize;
        executor.encode({
          ctx,
          encoder,
          module,
          inputs: { source: input, ...(i === 7 ? { over: targets[6]! } : {}) },
          output: targets[i]!,
          params: parameters,
          dispatch:
            module.kind === "fragment"
              ? { kind: "fragment" }
              : {
                  kind: "compute",
                  x: Math.ceil(width / wx),
                  y: Math.ceil(height / wy)
                }
        });
      }
      const encodeMs = performance.now() - start;
      gpu.queue.submit([encoder.finish()]);
      await gpu.queue.onSubmittedWorkDone();
      return { ms: performance.now() - start, encodeMs };
    }
    async function readback() {
      const size = width * height * (format === "rgba8unorm" ? 4 : 8);
      const buffer = gpu.createBuffer({
        size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
      const start = performance.now();
      const encoder = gpu.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: targets[7]!.texture },
        { buffer, bytesPerRow: width * (format === "rgba8unorm" ? 4 : 8) },
        { width, height }
      );
      gpu.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      expect(buffer.getMappedRange().byteLength).toBe(size);
      const ms = performance.now() - start;
      buffer.unmap();
      buffer.destroy();
      return { ms, bytes: size };
    }
    function dispose() {
      source.destroy();
      targets.forEach((t) => t.destroy());
      ctx.uniformRing.dispose();
      ctx.scratch.dispose();
      // Production context has no disposal API for its lazy optional-mask texture.
      // Release it explicitly for this context lifecycle experiment.
      ctx.getDefaultWhiteTexture().destroy();
    }
    return { allocationMs, upload, frame, readback, dispose };
  }
  const samples: object[] = [];
  gpu.pushErrorScope("validation");
  const routes = new Map<Format, ReturnType<typeof setup>>();
  for (const format of ["rgba8unorm", "rgba16float"] as const) {
    const runBefore = await quiet(),
      start = performance.now(),
      route = setup(format);
    const uploadMs = await route.upload();
    const first = await route.frame();
    samples.push({
      kind: "cold",
      format,
      before: runBefore,
      allocationMs: route.allocationMs,
      uploadMs,
      ...first,
      totalMs: performance.now() - start,
      adapter: adapterInfo
    });
    routes.set(format, route);
  }
  for (let i = 0; i < 5; i++) {
    for (const format of ["rgba8unorm", "rgba16float"] as const) {
      await routes.get(format)!.frame();
    }
  }
  for (let i = 0; i < 20; i++) {
    for (const format of ["rgba8unorm", "rgba16float"] as const) {
      const runBefore = await quiet();
      samples.push({
        kind: "steady",
        i,
        format,
        before: runBefore,
        ...(await routes.get(format)!.frame()),
        adapter: adapterInfo
      });
    }
  }
  for (let i = 0; i < 20; i++) {
    for (const [format, route] of routes) {
      const runBefore = await quiet();
      samples.push({
        kind: "transfer",
        i,
        format,
        before: runBefore,
        ...(await route.readback()),
        uploadMs: await route.upload(),
        adapter: adapterInfo
      });
    }
  }
  for (const route of routes.values()) {
    route.dispose();
  }
  for (let i = 0; i < 20; i++) {
    for (const format of ["rgba8unorm", "rgba16float"] as const) {
      const runBefore = await quiet(),
        route = setup(format);
      const uploadMs = await route.upload();
      const frame = await route.frame();
      route.dispose();
      await gpu.queue.onSubmittedWorkDone();
      samples.push({
        kind: "cycle",
        i,
        format,
        allocationMs: route.allocationMs,
        uploadMs,
        ...frame,
        before: runBefore,
        after: environment(),
        resources: resources(),
        adapter: adapterInfo
      });
    }
  }
  const timerProbe = async (work: () => Promise<unknown>) => {
    const delays: number[] = [];
    let running = true;
    const loop = (async () => {
      while (running) {
        const start = performance.now();
        await pause(5);
        delays.push(performance.now() - start - 5);
      }
    })();
    await work();
    running = false;
    await loop;
    return {
      count: delays.length,
      p95: percentile(delays, 0.95),
      max: Math.max(...delays)
    };
  };
  const idleBefore = await quiet();
  const idle = await timerProbe(() => pause(1000));
  const busy = [];
  for (const format of ["rgba8unorm", "rgba16float"] as const) {
    const runBefore = await quiet();
    const route = setup(format);
    await route.upload();
    await route.frame();
    busy.push({
      format,
      before: runBefore,
      ...(await timerProbe(async () => {
        for (let i = 0; i < 20; i++) {
          await route.frame();
        }
      }))
    });
    route.dispose();
  }
  const error = await gpu.popErrorScope();
  expect(error?.message ?? null).toBeNull();
  expect(liveTextures).toBe(0);
  expect(liveBuffers).toBe(0);
  writeFileSync(
    process.env.COLOR_COST_OUTPUT,
    JSON.stringify(
      {
        before,
        deviceMs,
        adapter: adapterInfo,
        samples,
        rejected,
        resources: resources(),
        eventLoop: { idleBefore, idle, busy }
      },
      null,
      2
    )
  );
}, 1_800_000);

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { beforeAll, expect, it } from "vitest";
import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { chromium } from "playwright";
import { create, globals } from "webgpu";
import { renderSketchDocument } from "../../image-editor/src/render/document.js";
import type { RenderSurface } from "../../image-editor/src/render/types.js";
import { shader, runBrush } from "./sketchI0/brush.js";

const out = process.env.I0_OUTPUT ?? "/home/mg/Projects/nodetool-film/tmp/color-i0";
beforeAll(async () => { await mkdir(out, { recursive: true }); });
const measurements: Record<string, unknown> = {};
// Dawn schedules event callbacks for each instance. Retain through test teardown.
const instances: GPU[] = [];
function dawn() { const gpu = create([]); instances.push(gpu); return gpu; }
function opaqueCodes() {
  const codes = new Uint16Array(256 * 256 * 4);
  for (let i = 0; i < 65536; i++) { codes.set([i, 65535 - i, i, 65535], i * 4); }
  return codes;
}
async function record(name: string, value: unknown) {
  measurements[name] = value;
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/measurements.json`, JSON.stringify(measurements, null, 2));
}
async function encode(data: Uint16Array, width: number, height: number) {
  return sharp(data, { raw: { width, height, channels: 4 } }).toColourspace("rgb16").png().toBuffer();
}
async function decode(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { ignoreIcc: true }).toColourspace("rgb16").ensureAlpha().raw({ depth: "ushort" }).toBuffer({ resolveWithObject: true });
  return { codes: new Uint16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)), info };
}
function initialPixels(width: number, height: number) {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) { data.set([0, 0, 0, 1], i * 4); }
  return data;
}

it("preserves opaque PNG16 codes and separately preserves straight low alpha and declared metadata", async () => {
  const codes = opaqueCodes();
  let png = await encode(codes, 256, 256);
  expect(png[24]).toBe(16); // PNG IHDR, not inferred from a float array.
  for (let cycle = 0; cycle < 3; cycle++) {
    const decoded = await decode(png);
    expect(decoded.codes).toEqual(codes);
    png = await encode(decoded.codes, 256, 256);
  }
  await writeFile(`${out}/opaque-all-codes.png`, png);
  const low = new Uint16Array([32769, 16385, 65534, 1, 12345, 23456, 34567, 257]);
  const lowPng = await sharp(low, { raw: { width: 2, height: 1, channels: 4 } })
    .toColourspace("rgb16").withMetadata({ density: 144 }).png().toBuffer();
  expect((await decode(await encode(low, 2, 1))).codes).toEqual(low);
  const taggedCodes = (await decode(lowPng)).codes;
  const metadata = await sharp(lowPng).metadata();
  const reopened = await sharp(lowPng, { ignoreIcc: true }).keepMetadata().toColourspace("rgb16").png().toBuffer();
  const metadata2 = await sharp(reopened).metadata();
  expect(metadata2.density).toBe(144);
  expect(metadata2.icc).toEqual(metadata.icc);
  expect(metadata.icc?.length).toBeGreaterThan(0);
  expect((await decode(reopened)).codes).toEqual(taggedCodes);
  await writeFile(`${out}/low-alpha.png`, lowPng);
  await record("codec", { opaqueCodes: 65536, cycles: 3, depth: metadata2.depth, density: metadata2.density, iccBytes: metadata2.icc?.length, lowAlphaCodes: Array.from(low) });
});

it("retains the real calcium still samples through an existing Sharp PNG16 route", async () => {
  const source = await readFile(`${out}/calcium_imaging.tif`);
  const metadata = await sharp(source).metadata();
  expect(metadata.bitsPerSample).toBe(16);
  const original = await sharp(source).toColourspace("grey16").raw({ depth: "ushort" }).toBuffer();
  const png = await sharp(source).toColourspace("grey16").png().toBuffer();
  expect(png[24]).toBe(16);
  const restored = await sharp(png).toColourspace("grey16").raw({ depth: "ushort" }).toBuffer();
  expect(restored).toEqual(original);
  await writeFile(`${out}/calcium-still16.png`, png);
  await record("still", { sha256: createHash("sha256").update(source).digest("hex"), metadata, pngBytes: png.length, distinct: new Set(new Uint16Array(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength))).size });
});

it("compares completed FP32 brush revisions, PNG16 delivery and checkpoint restoration on Dawn", async () => {
  Object.assign(globalThis, globals);
  const cold = performance.now();
  const gpu = dawn();
  const adapter = await gpu.requestAdapter();
  expect(adapter).not.toBeNull();
  const device = await adapter!.requestDevice();
  const coldDeviceMs = performance.now() - cold;
  const errors: string[] = [];
  device.addEventListener("uncapturederror", e => errors.push(e.error.message));
  const width = 1024, height = 1024;
  const initial = initialPixels(width, height);
  const start = performance.now();
  const result = await runBrush(device, shader, initial, width, height, 25);
  const elapsedMs = performance.now() - start;
  const center = (512 * width + 512) * 4;
  const expected = 1 - Math.pow(0.999, 25);
  expect(result.edited[center]).toBeCloseTo(expected, 6);
  expect(Buffer.from(result.undo.buffer).equals(Buffer.from(initial.buffer))).toBe(true);
  expect(Buffer.from(result.redo.buffer).equals(Buffer.from(result.edited.buffer))).toBe(true);
  expect(result.edited[0]).toBe(0);
  const codes = Uint16Array.from(result.edited, v => Math.round(v * 65535));
  let t = performance.now();
  const saved = await encode(codes, width, height);
  const saveMs = performance.now() - t;
  t = performance.now();
  const reopened = await decode(saved);
  const reopenMs = performance.now() - t;
  expect(Buffer.from(reopened.codes.buffer).equals(Buffer.from(codes.buffer))).toBe(true);
  let maximumSaveError = 0;
  for (let i = 0; i < codes.length; i++) { maximumSaveError = Math.max(maximumSaveError, Math.abs(codes[i]! / 65535 - result.edited[i]!)); }
  expect(maximumSaveError).toBeLessThanOrEqual(0.5 / 65535);
  await writeFile(`${out}/brush-fp32.png`, saved);
  const png8 = await sharp(saved).toColourspace("srgb").png().toBuffer();
  await writeFile(`${out}/brush-export8.png`, png8);
  // Completed checkpoint outlives the device. No replay or claim for newer edits.
  const checkpoint = new Float32Array(result.edited);
  device.destroy();
  const replacement = await gpu.requestAdapter();
  const fresh = await replacement!.requestDevice();
  t = performance.now();
  const recovery = await runBrush(fresh, shader, checkpoint, width, height, 0);
  const recoveryMs = performance.now() - t;
  expect(Buffer.from(recovery.edited.buffer).equals(Buffer.from(result.edited.buffer))).toBe(true);
  fresh.destroy();
  expect(errors).toEqual([]);
  const warm = result.times.slice(5).sort((a, b) => a - b);
  await record("dawn", { adapter: { vendor: adapter!.info.vendor, architecture: adapter!.info.architecture, device: adapter!.info.device, description: adapter!.info.description }, features: Array.from(adapter!.features), deviceFeatures: Array.from(device.features),
    coldDeviceMs, compileMs: result.compileMs, uploadMs: result.uploadMs, readbackMs: result.readbackMs, historyMs: result.historyMs,
    medianMs: warm[10], p95Ms: warm[18], times: result.times, elapsedMs, recoveryMs, saveMs, reopenMs,
    gpuBytes: result.gpuBytes, cpuSnapshotBytes: result.cpuSnapshotBytes, uploads: result.uploads, readbacks: result.readbacks,
    png16Bytes: saved.length, png8Bytes: png8.length, maximumSaveError, center: result.edited[center], expected,
    rssMiB: process.memoryUsage().rss / 1048576, peakRssMiB: process.resourceUsage().maxRSS / 1024 });
}, 120_000);

it("checks the current Canvas commit primitive and the shared agent/CLI Canvas reader depth", async () => {
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "black"; ctx.fillRect(0, 0, 1024, 1024);
  const stamp = createCanvas(1024, 1024), s = stamp.getContext("2d");
  s.fillStyle = "white"; s.beginPath(); s.arc(512, 512, 1024 * 0.45, 0, Math.PI * 2); s.fill();
  const times: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    ctx.globalAlpha = 0.001; ctx.drawImage(stamp, 0, 0);
    ctx.getImageData(512, 512, 1, 1); // Completion of the byte commit.
    times.push(performance.now() - start);
  }
  await writeFile(`${out}/brush-canvas8.png`, canvas.toBuffer("image/png"));
  const center = Array.from(ctx.getImageData(512, 512, 1, 1).data);
  expect(center).toEqual([0, 0, 0, 255]);
  const image = await loadImage(await encode(opaqueCodes(), 256, 256));
  const reader = createCanvas(image.width, image.height);
  const rendered = await renderSketchDocument({ canvas: { width: image.width, height: image.height }, layers: [{
    id: "opaque", name: "opaque", type: "raster", visible: true, opacity: 1, blendMode: "normal",
    data: `data:image/png;base64,${(await encode(opaqueCodes(), 256, 256)).toString("base64")}`
  }] }, {
    createSurface: (width, height) => createCanvas(width, height) as unknown as RenderSurface,
    loadImage: async () => image, compositeOperation: () => "source-over", supportsFilter: true
  });
  // Same shared document renderer and Skia decoder used by the agent and CLI.
  reader.getContext("2d").drawImage(rendered.surface as unknown as ReturnType<typeof createCanvas>, 0, 0);
  const exported = reader.toBuffer("image/png");
  expect(exported[24]).toBe(8);
  await writeFile(`${out}/reader-export8.png`, exported);
  const warm = times.slice(5).sort((a, b) => a - b);
  await record("canvas", { center, medianMs: warm[10], p95Ms: warm[18], readerExportDepth: exported[24], times });
});

it("attempts only a headless browser qualification and records the actual adapter", async () => {
  const server = createServer((_req, res) => res.end("I0 isolated proof"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") { throw new Error("No local proof port"); }
  const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-webgpu"] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.addScriptTag({ content: `globalThis.i0Brush = ${runBrush.toString()}` });
    const diagnostics = await page.evaluate(async ({ code }) => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) { return { available: false, reason: "navigator.gpu/requestAdapter unavailable" }; }
      const device = await adapter.requestDevice();
      const width = 256, height = 256;
      const pixels = new Float32Array(width * height * 4);
      for (let i = 0; i < width * height; i++) { pixels[i * 4 + 3] = 1; }
      // Test-only script injected above, serialized without a bundler or app imports.
      const run = Reflect.get(globalThis, "i0Brush");
      const result = await run(device, code, pixels, width, height, 25);
      const c = new OffscreenCanvas(width, height), ctx = c.getContext("2d")!;
      ctx.fillStyle = "black"; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "white"; ctx.globalAlpha = 0.001;
      for (let i = 0; i < 25; i++) { ctx.fillRect(0, 0, width, height); }
      device.destroy();
      return { available: true, adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description }, features: Array.from(adapter.features),
        fp32Center: result.edited[(128 * width + 128) * 4], canvasCenter: Array.from(ctx.getImageData(128, 128, 1, 1).data),
        exactUndo: result.undo.every((v: number, i: number) => v === pixels[i]), exactRedo: result.redo.every((v: number, i: number) => v === result.edited[i]), times: result.times };
    }, { code: shader });
    await record("browser", diagnostics);
    if (diagnostics.available) {
      expect(diagnostics.fp32Center).toBeCloseTo(1 - Math.pow(0.999, 25), 6);
      expect(diagnostics.exactUndo).toBe(true);
      expect(diagnostics.exactRedo).toBe(true);
    }
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 60_000);

it("separates opaque identity, low alpha edits, photo annotation and gradient editing", async () => {
  Object.assign(globalThis, globals);
  const gpu = dawn(), adapter = await gpu.requestAdapter(), device = await adapter!.requestDevice();
  try {
    const opaque = await decode(await encode(opaqueCodes(), 256, 256));
    const unchanged = await runBrush(device, shader, Float32Array.from(opaque.codes, c => c / 65535), 256, 256, 0);
    const identity = Uint16Array.from(unchanged.edited, c => Math.round(c * 65535));
    expect(identity).toEqual(opaque.codes);
    const a = 1 / 65535;
    const low = new Float32Array(16 * 16 * 4);
    for (let i = 0; i < 256; i++) { low.set([0.2 * a, 0.4 * a, 0.6 * a, a], i * 4); }
    low.set([0, 0, 0, 0], 0);
    const lowEdit = await runBrush(device, shader, low, 16, 16, 1);
    const center = (8 * 16 + 8) * 4;
    expect(lowEdit.edited[center]).toBeCloseTo(0.001 + 0.2 * a * 0.999, 8);
    expect(lowEdit.edited[center + 3]).toBeCloseTo(0.001 + a * 0.999, 8);
    // Explicit straight-alpha save boundary. Do not use unpremul's 1/255 floor.
    const straight = Uint16Array.from(lowEdit.edited, (v, i) => {
      const alpha = lowEdit.edited[i - i % 4 + 3]!;
      return Math.round(65535 * (i % 4 === 3 ? v : alpha > 0 ? v / alpha : 0));
    });
    expect(Array.from(straight.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    const lowSaved = await encode(straight, 16, 16);
    expect((await decode(lowSaved)).codes).toEqual(straight);
    await writeFile(`${out}/low-alpha-edited.png`, lowSaved);
    const scenes = [];
    for (const name of ["photo", "gradient", "calcium"]) {
      let width: number, height: number, pixels: Float32Array;
      if (name === "photo") {
        const decoded = await sharp(await readFile(`${out}/chelsea.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        width = decoded.info.width; height = decoded.info.height;
        pixels = Float32Array.from(decoded.data, c => c / 255);
      } else if (name === "calcium") {
        const decoded = await sharp(await sharp(await readFile(`${out}/calcium_imaging.tif`)).toColourspace("grey16").png().toBuffer()).toColourspace("grey16").raw({ depth: "ushort" }).toBuffer();
        const codes = new Uint16Array(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength));
        width = 40; height = 30; pixels = new Float32Array(width * height * 4);
        for (let i = 0; i < codes.length; i++) { const c = codes[i]! / 65535; pixels.set([c, c, c, 1], i * 4); }
      } else {
        width = 1024; height = 256; pixels = initialPixels(width, height);
        for (let i = 0; i < width * height; i++) { const c = (i % width) / (width - 1); pixels.set([c, c, c, 1], i * 4); }
      }
      const result = await runBrush(device, shader, pixels, width, height, 25);
      const codes = Uint16Array.from(result.edited, v => Math.round(v * 65535));
      const png = await encode(codes, width, height);
      const png8 = await sharp(png).toColourspace("srgb").png().toBuffer();
      await writeFile(`${out}/${name}-edited16.png`, png);
      await writeFile(`${out}/${name}-edited8.png`, png8);
      expect(Buffer.from((await decode(png)).codes.buffer).equals(Buffer.from(codes.buffer))).toBe(true);
      const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
      expect(result.edited[center]).toBeCloseTo(1 - (1 - pixels[center]!) * Math.pow(0.999, 25), 6);
      const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
      const sourcePng = await encode(Uint16Array.from(pixels, c => Math.round(c * 65535)), width, height);
      ctx.drawImage(await loadImage(sourcePng), 0, 0);
      ctx.fillStyle = "white"; ctx.globalAlpha = 0.001;
      for (let i = 0; i < 25; i++) {
        ctx.beginPath(); ctx.arc(width / 2, height / 2, width * 0.45, 0, Math.PI * 2); ctx.fill();
      }
      const baseline = canvas.toBuffer("image/png");
      await writeFile(`${out}/${name}-canvas8.png`, baseline);
      const gpu8 = await sharp(png8).ensureAlpha().raw().toBuffer();
      const canvas8 = ctx.getImageData(0, 0, width, height).data;
      let maxCodeDelta = 0, sumSquare = 0;
      for (let i = 0; i < gpu8.length; i++) {
        const delta = Math.abs(gpu8[i]! - canvas8[i]!);
        maxCodeDelta = Math.max(maxCodeDelta, delta); sumSquare += delta * delta;
      }
      scenes.push({ name, width, height, png16Bytes: png.length, png8Bytes: png8.length,
        maxFinal8CodeDelta: maxCodeDelta, rmsFinal8CodeDelta: Math.sqrt(sumSquare / gpu8.length) });
    }
    await record("scenes", { opaqueIdentity: true, lowAlpha: { inputAlpha: a, editedAlpha: lowEdit.edited[center + 3] }, scenes });
  } finally { device.destroy(); }
}, 60_000);

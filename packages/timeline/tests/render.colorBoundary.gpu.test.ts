import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { openRgbaFrameReader, openVideoFrameEncoder } from "@nodetool-ai/runtime/media";
import { readRgbaFramesWith, videoStreamFormat } from "@nodetool-ai/runtime/media/testing";
// Exercise the server boundary itself rather than copying its format table.
import { decodeStillRgba, encoderSpecFromArgs } from "../../video-nodes/src/nodes/timeline/rawFrames.js";
import { resolveTimelineOutput } from "../../video-nodes/src/nodes/timeline/outputFormats.js";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";

const width = 256;
const height = 16;

async function encode(path: string, rgba: Uint8Array, png: boolean): Promise<void> {
  if (png) {
    // Same canvas writer used by the server PNG-sequence boundary.
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    const image = context.createImageData(width, height);
    image.data.set(rgba);
    context.putImageData(image, 0, 0);
    await writeFile(path, canvas.toBuffer("image/png"));
    return;
  }
  const encoder = await openVideoFrameEncoder({
    outPath: path, width, height, fps: 24, input: "rgba",
    spec: {
      codec: "libx264", pixelFormat: "yuv420p",
      filter: "scale=out_color_matrix=bt709:out_range=tv",
      options: { preset: "veryfast", colorspace: "bt709", color_primaries: "bt709", color_trc: "bt709" }
    }
  });
  try {
    await encoder.write(rgba);
    await encoder.finish();
  } catch (error) {
    await encoder.abort();
    throw error;
  }
}

async function decode(path: string): Promise<Uint8Array> {
  const reader = await openRgbaFrameReader({
    filePath: path,
    filter: `scale=${width}:${height}:flags=accurate_rnd+full_chroma_int,format=rgba`,
    readAhead: 1
  });
  if (!reader) throw new Error("Fixture has no video stream");
  try {
    const frame = await reader.next();
    if (!frame) throw new Error("Fixture has no decoded frame");
    return frame.rgba;
  } finally {
    await reader.close();
  }
}

for (const png of [true, false]) {
  it(`preserves decoded SDR ${png ? "PNG ramps and low alpha" : "H.264 ramps"} through rendering and delivery`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeline-color-boundary-"));
    const extension = png ? "png" : "mp4";
    const renderer = new HeadlessFrameCompositor(await getNodeGPUDevice(), width, height, { workingFormat: "rgba8unorm" });
    try {
      const source = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          source.set([x, png && y > 7 ? 255 - x : x, png && y > 7 ? Math.floor(x / 2) : x, png && y > 7 ? [1, 2, 8, 16, 32, 64, 128, 255][y - 8]! : 255], (y * width + x) * 4);
        }
      }
      const input = join(directory, `input.${extension}`);
      await encode(input, source, png);
      const decoded = await decode(input);
      // Decoder/codec error is measured before rendering, not charged to the GPU.
      for (let i = 0; i < source.length; i++) {
        const alpha = source[Math.floor(i / 4) * 4 + 3]!;
        const allowance = png ? (i % 4 === 3 || alpha === 255 ? 0 : Math.ceil(127.5 / alpha)) : 5;
        expect(Math.abs(decoded[i]! - source[i]!)).toBeLessThanOrEqual(allowance);
      }
      const rendered = await renderer.renderFrame([{
        id: "fixture", source: { rgba: decoded, width, height },
        opacity: 1, blendMode: "normal", zIndex: 0
      }], [], { alpha: png });
      const expected = new Uint8Array(decoded);
      for (let i = 0; i < expected.length; i += 4) {
        const alpha = decoded[i + 3]!;
        for (let channel = 0; channel < 3; channel++) {
          // Existing RGBA8 accumulation quantizes premultiplied encoded samples.
          expected[i + channel] = Math.round(Math.round(decoded[i + channel]! * alpha / 255) * 255 / alpha);
          expect(Math.abs(rendered[i + channel]! - expected[i + channel]!)).toBeLessThanOrEqual(1);
        }
        expect(rendered[i + 3]).toBe(alpha);
      }
      const actualPath = join(directory, `rendered.${extension}`);
      const referencePath = join(directory, `reference.${extension}`);
      await encode(actualPath, rendered, png);
      await encode(referencePath, expected, png);
      const actualDelivery = await decode(actualPath);
      const referenceDelivery = await decode(referencePath);
      // Same delivery encoder on both branches isolates codec loss from rendering.
      for (let i = 0; i < actualDelivery.length; i++) {
        expect(Math.abs(actualDelivery[i]! - referenceDelivery[i]!)).toBeLessThanOrEqual(1);
        const alpha = rendered[Math.floor(i / 4) * 4 + 3]!;
        const codecAllowance = png ? (i % 4 === 3 || alpha === 255 ? 0 : Math.ceil(127.5 / alpha)) : 5;
        expect(Math.abs(actualDelivery[i]! - rendered[i]!)).toBeLessThanOrEqual(codecAllowance);
      }
    } finally {
      renderer.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
}


function ramp(alpha: boolean): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Flat chroma within each row keeps 4:2:0 loss separate from transfer.
      const a = alpha ? [0, 1, 2, 8, 16, 32, 128, 255][Math.floor(y / 2)]! : 255;
      pixels.set([x, x, x, a], (y * width + x) * 4);
    }
  }
  return pixels;
}

function maximumError(actual: Uint8Array, expected: Uint8Array): number {
  expect(actual.length).toBe(expected.length);
  let maximum = 0;
  for (let i = 0; i < actual.length; i++) {
    maximum = Math.max(maximum, Math.abs(actual[i]! - expected[i]!));
  }
  return maximum;
}

function expectedRender(decoded: Uint8Array): Uint8Array {
  const expected = new Uint8Array(decoded);
  for (let i = 0; i < expected.length; i += 4) {
    const a = decoded[i + 3]!;
    for (let c = 0; c < 3; c++) {
      expected[i + c] = a === 0 ? 0 : Math.round(Math.round(decoded[i + c]! * a / 255) * 255 / a);
    }
  }
  return expected;
}

async function renderDecoded(decoded: Uint8Array, alpha: boolean): Promise<Uint8Array> {
  const renderer = new HeadlessFrameCompositor(await getNodeGPUDevice(), width, height, { workingFormat: "rgba8unorm" });
  try {
    const rendered = await renderer.renderFrame([{
      id: "route", source: { rgba: decoded, width, height },
      opacity: 1, blendMode: "normal", zIndex: 0
    }], [], { alpha });
    const expected = expectedRender(decoded);
    const error = maximumError(rendered, expected);
    const worst = rendered.findIndex((value, i) => Math.abs(value - expected[i]!) === error);
    const pixel = worst - worst % 4;
    console.info("render boundary", { error, pixel: pixel / 4,
      decoded: Array.from(decoded.slice(pixel, pixel + 4)),
      rendered: Array.from(rendered.slice(pixel, pixel + 4)),
      expected: Array.from(expected.slice(pixel, pixel + 4)) });
    expect(error, "render error after byte alpha quantization").toBeLessThanOrEqual(1);
    return rendered;
  } finally {
    renderer.dispose();
  }
}

for (const format of ["png", "jpeg", "webp"] as const) {
  for (const profile of [undefined, "srgb", "p3"] as const) {
    it(`imports ${format} ${profile ?? "untagged"} decoder samples without a second transfer`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "timeline-still-boundary-"));
      try {
        const source = ramp(format !== "jpeg");
        for (let i = 0; i < source.length; i += 4) {
          source[i + 1] = 255 - source[i]!;
          source[i + 2] = Math.floor(source[i]! / 2);
        }
        let image = sharp(source, { raw: { width, height, channels: 4 } });
        if (profile) image = image.withIccProfile(profile);
        const bytes = await image.toFormat(format).toBuffer();
        const metadata = await sharp(bytes).metadata();
        expect(Boolean(metadata.icc)).toBe(profile !== undefined);
        const path = join(directory, `input.${format}`);
        await writeFile(path, bytes);
        const decoded = await decode(path);
        const imported = await decodeStillRgba(path, { width, height });
        expect(imported).not.toBeNull();
        expect(imported!.rgba).toEqual(decoded);
        console.info("still input codec/profile loss", { format, profile, error: maximumError(decoded, source) });
        // Profile normalization is deliberately not inferred from byte identity.
        const rendered = await renderDecoded(decoded, format !== "jpeg");
        const output = join(directory, "output.png");
        await encode(output, rendered, true);
        const delivered = await decode(output);
        for (let i = 0; i < delivered.length; i++) {
          const a = rendered[Math.floor(i / 4) * 4 + 3]!;
          const allowance = i % 4 === 3 || a === 255 || a === 0 ? 0 : Math.ceil(127.5 / a);
          expect(Math.abs(delivered[i]! - rendered[i]!), "PNG delivery error").toBeLessThanOrEqual(allowance);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 60_000);
  }
}

async function encodeRoute(path: string, pixels: Uint8Array, format: string, alpha: boolean, videoCodec?: string): Promise<void> {
  const output = resolveTimelineOutput({ format, alpha, videoCodec });
  const encoder = await openVideoFrameEncoder({
    outPath: path, width, height, fps: 24, input: "rgba",
    spec: {
      ...encoderSpecFromArgs(output.encoderArgs),
      ...(videoCodec === "libx265" ? {
        // Bound this fixture's native worker pool on the shared machine.
        options: { ...encoderSpecFromArgs(output.encoderArgs).options, "x265-params": "pools=none:frame-threads=1" }
      } : {})
    }
  });
  try {
    await encoder.write(pixels);
    await encoder.finish();
  } catch (error) {
    await encoder.abort();
    throw error;
  }
}

for (const format of ["mp4", "webm", "mov"]) {
  for (const alpha of format === "mp4" ? [false] : [false, true]) {
    it(`preserves ${format} alpha=${alpha} decoded samples through the server codec boundary`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "timeline-video-boundary-"));
      try {
        const source = ramp(alpha);
        const input = join(directory, `input.${format}`);
        await encodeRoute(input, source, format, alpha);
        // B216: native VP9 drops WebM BlockAdditions alpha. Qualify delivery with libvpx.
        const decodeDelivery = format === "webm" && alpha
          ? async (path: string): Promise<Uint8Array> => {
            const frames = await readRgbaFramesWith(path, "libvpx-vp9", { width, height });
            expect(frames).toHaveLength(1);
            return frames[0]!;
          }
          : decode;
        const decoded = await decodeDelivery(input);
        // Alpha must survive decoding, not just appear in the requested pixel format.
        const alphaError = Math.max(...Array.from({ length: width * height }, (_, p) =>
          Math.abs(decoded[p * 4 + 3]! - source[p * 4 + 3]!)));
        if (alpha) {
          console.info("alpha decode", { format, alphaError, metadata: await videoStreamFormat(input) });
        }
        expect(alphaError, "input codec alpha error").toBeLessThanOrEqual(1);
        const rgbError = Math.max(...Array.from({ length: width * height }, (_, p) =>
          Math.abs(decoded[p * 4]! - source[p * 4]!)));
        expect(rgbError, "input codec ramp error").toBeLessThanOrEqual(5);
        const rendered = await renderDecoded(decoded, alpha);
        const actualPath = join(directory, `actual.${format}`);
        const referencePath = join(directory, `reference.${format}`);
        await encodeRoute(actualPath, rendered, format, alpha);
        await encodeRoute(referencePath, expectedRender(decoded), format, alpha);
        expect(maximumError(await decodeDelivery(actualPath), await decodeDelivery(referencePath))).toBeLessThanOrEqual(1);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 60_000);
  }
}

function srgbToBt709(code: number): number {
  const encoded = code / 255;
  const linear = encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  return Math.round(255 * (linear < 0.018 ? 4.5 * linear : 1.099 * linear ** 0.45 - 0.099));
}

for (const format of ["mp4", "webm", "mov"]) {
  // O1 accepts the inaccurate tag to preserve source appearance. See
  // docs/plans/color-precision/high-precision-media-processing.md, A101 owner decision.
  it(`preserves O1 pass-through samples and BT.709 tags for sRGB PNG to ${format} delivery`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "timeline-transfer-declaration-"));
    try {
      const input = join(directory, "srgb.png");
      await sharp(ramp(false), { raw: { width, height, channels: 4 } })
        .withIccProfile("srgb").png().toFile(input);
      const decoded = await decode(input);
      const rendered = await renderDecoded(decoded, false);
      const actualPath = join(directory, `actual.${format}`);
      const referencePath = join(directory, `reference.${format}`);
      await encodeRoute(actualPath, rendered, format, false);
      const expected = decoded;
      // Encode unconverted source independently to measure this codec's loss.
      await encodeRoute(referencePath, expected, format, false);
      const actual = await decode(actualPath);
      const reference = await decode(referencePath);
      const stream = await videoStreamFormat(actualPath);
      const codecLoss = maximumError(reference, expected);
      const deliveryError = maximumError(actual, expected);
      console.info("O1 delivery metadata", stream, { codecLoss, deliveryError });
      expect(stream).toMatchObject({
        colorTransfer: "bt709", colorSpace: "bt709", colorPrimaries: "bt709", colorRange: "tv"
      });
      // A98's ramp round trips lose at most 2 codes for H.264/VP9 and 0 for
      // opaque ProRes. Cap the oracle there so conversion cannot inflate the bound.
      expect(codecLoss, "unconverted reference codec loss").toBeLessThanOrEqual(format === "mov" ? 0 : 2);
      // Allow measured codec loss plus the renderer's one-code RGBA8 rounding.
      expect(deliveryError, "O1 source sample error").toBeLessThanOrEqual(codecLoss + 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
}


// B215: P3 PNG import differs from profile-aware sRGB normalization by 55 codes.
it.fails("normalizes Display P3 PNG input to the sRGB delivery interpretation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "timeline-profile-boundary-"));
  try {
    const source = ramp(false);
    for (let i = 0; i < source.length; i += 4) {
      source[i + 1] = 128;
      source[i + 2] = 64;
    }
    const bytes = await sharp(source, { raw: { width, height, channels: 4 } })
      .withIccProfile("p3").png().toBuffer();
    const path = join(directory, "p3.png");
    await writeFile(path, bytes);
    const decoded = await decodeStillRgba(path, { width, height });
    expect(decoded).not.toBeNull();
    // LittleCMS-backed decode is an independent profile-aware sRGB reference.
    const srgb = await sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer();
    const error = maximumError(decoded!.rgba, srgb);
    console.info("P3 to sRGB decoder error", error);
    expect(error, "profile normalization before sRGB delivery").toBeLessThanOrEqual(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);


it("refuses unsupported MP4 alpha and JPEG/WebP timeline delivery", () => {
  expect(() => resolveTimelineOutput({ format: "mp4", alpha: true })).toThrow("no alpha channel");
  for (const format of ["jpeg", "webp"]) {
    expect(() => resolveTimelineOutput({ format })).toThrow("Unknown render format");
  }
});


// B217: HEVC MP4 fails on the first encoded packet, before transfer assertions.
it.fails("qualifies the available HEVC MP4 override against its declared transfer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "timeline-hevc-boundary-"));
  try {
    const source = ramp(false);
    const input = join(directory, "input.mp4");
    await encodeRoute(input, source, "mp4", false, "libx265");
    const decoded = await decode(input);
    expect(maximumError(decoded, source), "HEVC input codec loss").toBeLessThanOrEqual(5);
    const rendered = await renderDecoded(decoded, false);
    const actualPath = join(directory, "actual.mp4");
    const referencePath = join(directory, "reference.mp4");
    await encodeRoute(actualPath, rendered, "mp4", false, "libx265");
    const expected = new Uint8Array(decoded);
    for (let i = 0; i < expected.length; i++) {
      if (i % 4 !== 3) expected[i] = srgbToBt709(decoded[i]!);
    }
    await encodeRoute(referencePath, expected, "mp4", false, "libx265");
    const reference = await decode(referencePath);
    const actual = await decode(actualPath);
    console.info("HEVC delivery", { codecLoss: maximumError(reference, expected), transferError: maximumError(actual, reference) });
    expect(maximumError(reference, expected), "HEVC reference codec loss").toBeLessThanOrEqual(5);
    expect(maximumError(actual, reference), "HEVC declared BT.709 transfer error").toBeLessThanOrEqual(5);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

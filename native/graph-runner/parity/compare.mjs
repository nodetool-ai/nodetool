// The stream comparison of tools/conformance.mjs, so both tools compare
// streams with the same code: per job, per edge, per node, with the same
// ignored fields.
//
// One addition for the parity suite: image values are compared by their
// pixels with a tolerance, and nothing else in a message is. Both sides run
// the same WGSL, but TypeScript compiles it with Dawn (Tint) and the native
// runner with wgpu-native (naga), so the generated shader code differs in
// operation order and rounding even on the same Vulkan driver (lavapipe).
// Byte-exact output is therefore not expected. An image value is an object
// with `type: "image"` whose pixels are readable here: raw straight-alpha
// RGBA (`data: {__rgba__: <base64>}`, written by reference-batch.mjs), PNG
// bytes in base64 `data`, or a `data:image/png;base64,` URI. Its encoding
// (raw RGBA in the reference, PNG at the native runner's message boundary)
// is not compared, only the decoded pixels, the size and the ref's other
// fields. Pixels match when every premultiplied channel differs by at most
// PIXEL_TOLERANCE 8-bit levels: one level, for a shader result that the two
// compilers round to either side of a quantization step. Premultiplied,
// because a straight-alpha channel of a nearly transparent pixel magnifies a
// one-level difference up to 255 times. run.mjs records the measured maximum
// per case in result.json and summary.md.
import { inflateSync } from "node:zlib";
import * as conformance from "../tools/conformance.mjs";

export { parseStream, toStreams, finalStatus } from "../tools/conformance.mjs";

/** Largest premultiplied per-channel difference two image values may have. */
export const PIXEL_TOLERANCE = 1;

const PNG_SIGNATURE = "89504e470d0a1a0a";

/** RGBA8 pixels of a non-interlaced 8-bit PNG (any colour type). */
export function decodePng(buf) {
  if (buf.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error("not a PNG");
  let off = 8;
  let header;
  let palette;
  let transparency;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const { width, height, depth, color, interlace } = header;
  if (interlace !== 0) throw new Error("interlaced PNG");
  if (depth !== 8 && depth !== 16) throw new Error(`PNG bit depth ${depth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const bpp = channels * (depth / 8);
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = (src[i] + predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  const sample = (i, ch) => lines[(i * channels + ch) * (depth / 8)];
  for (let i = 0; i < width * height; i++) {
    let r, g, b, a = 255;
    if (color === 0) r = g = b = sample(i, 0);
    else if (color === 4) { r = g = b = sample(i, 0); a = sample(i, 1); }
    else if (color === 2) { r = sample(i, 0); g = sample(i, 1); b = sample(i, 2); }
    else if (color === 6) { r = sample(i, 0); g = sample(i, 1); b = sample(i, 2); a = sample(i, 3); }
    else {
      const p = sample(i, 0);
      r = palette[p * 3]; g = palette[p * 3 + 1]; b = palette[p * 3 + 2];
      a = transparency && p < transparency.length ? transparency[p] : 255;
    }
    rgba.set([r, g, b, a], i * 4);
  }
  return { width, height, rgba };
}

/** Pixels of an image value, or null when the value carries none readable here. */
export function imagePixels(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.type !== "image") return null;
  try {
    const { data, uri } = value;
    if (data && typeof data === "object" && typeof data.__rgba__ === "string") {
      return { width: value.width, height: value.height, rgba: Buffer.from(data.__rgba__, "base64") };
    }
    if (data && typeof data === "object" && typeof data.__bytes__ === "string") {
      const bytes = Buffer.from(data.__bytes__, "base64");
      if (value.mimeType === "image/x-raw-rgba") {
        if (bytes.length !== value.width * value.height * 4) throw new Error("invalid raw RGBA size");
        return { width: value.width, height: value.height, rgba: bytes };
      }
      return decodePng(bytes);
    }
    if (typeof data === "string" && data.length > 0) {
      const payload = data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data;
      return decodePng(Buffer.from(payload, "base64"));
    }
    if (typeof uri === "string" && uri.startsWith("data:image/png;base64,")) {
      return decodePng(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
    }
  } catch {
    return null;
  }
  return null;
}

/** Largest premultiplied per-channel difference and where it is. */
export function pixelDifference(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.rgba.length !== b.rgba.length) {
    return { sizeMismatch: `${a.width}x${a.height} vs ${b.width}x${b.height}`, max: Infinity };
  }
  let max = 0;
  let at = null;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const aa = a.rgba[i + 3], ab = b.rgba[i + 3];
    for (let c = 0; c < 4; c++) {
      const va = c === 3 ? aa : (a.rgba[i + c] * aa) / 255;
      const vb = c === 3 ? ab : (b.rgba[i + c] * ab) / 255;
      const d = Math.abs(va - vb);
      if (d > max) {
        max = d;
        at = { x: (i / 4) % a.width, y: Math.floor(i / 4 / a.width), channel: "rgba"[c] };
      }
    }
  }
  return { max: Math.round(max * 100) / 100, at };
}

/** The image ref without its pixel encoding, plus the decoded size and a pixel verdict. */
function summary(value, image, verdict) {
  const { data, mimeType, uri, ...rest } = value;
  const keptUri = typeof uri === "string" && !uri.startsWith("data:") ? { uri } : {};
  return { ...rest, ...keptUri, pixels: `${image.width}x${image.height} ${verdict}` };
}

/**
 * Walks a reference and a native message side by side and replaces each
 * pair of image values with comparable summaries. Records every measured
 * difference in `stats.images`.
 */
function pairImages(want, got, stats, path) {
  const a = imagePixels(want);
  const b = a ? imagePixels(got) : null;
  if (a && b) {
    const diff = pixelDifference(a, b);
    stats.images.push({ path, ...diff });
    const match = diff.max <= PIXEL_TOLERANCE;
    const verdict = match
      ? "within tolerance"
      : `max premultiplied difference ${diff.sizeMismatch ?? diff.max}${diff.at ? ` at ${JSON.stringify(diff.at)}` : ""}`;
    return [summary(want, a, match ? verdict : "reference"), summary(got, b, verdict)];
  }
  if (Array.isArray(want) && Array.isArray(got)) {
    const n = Math.min(want.length, got.length);
    const outA = [...want], outB = [...got];
    for (let i = 0; i < n; i++) [outA[i], outB[i]] = pairImages(want[i], got[i], stats, `${path}[${i}]`);
    return [outA, outB];
  }
  if (want && got && typeof want === "object" && typeof got === "object" && !Array.isArray(want) && !Array.isArray(got)) {
    const outA = { ...want }, outB = { ...got };
    for (const k of Object.keys(want)) {
      if (k in got) [outA[k], outB[k]] = pairImages(want[k], got[k], stats, path ? `${path}.${k}` : k);
    }
    return [outA, outB];
  }
  return [want, got];
}

/**
 * diffStreams with pixel-tolerant image values. `stats`, when given,
 * collects `{path, max, at}` for every compared image pair.
 */
export function diffStreams(expected, actual, stats = { images: [] }) {
  const want = new Map();
  const got = new Map();
  for (const [key, messages] of expected) {
    const other = actual.get(key);
    if (!other) {
      want.set(key, messages);
      continue;
    }
    const a = [], b = [];
    for (let i = 0; i < Math.max(messages.length, other.length); i++) {
      if (i < messages.length && i < other.length) {
        const [x, y] = pairImages(messages[i], other[i], stats, `${key}#${i + 1}`);
        a.push(x);
        b.push(y);
      } else {
        if (i < messages.length) a.push(messages[i]);
        if (i < other.length) b.push(other[i]);
      }
    }
    want.set(key, a);
    got.set(key, b);
  }
  for (const [key, messages] of actual) if (!got.has(key)) got.set(key, messages);
  return conformance.diffStreams(want, got);
}

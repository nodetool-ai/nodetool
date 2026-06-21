import { importHidden } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";

// `sharp` is a native Node addon. Load it lazily via a bundler-hidden import so
// this module stays browser-bundle-safe (the GPU color-grading node imports the
// pure helpers below); only the two Node-only float-RGB helpers touch it.
type SharpFn = typeof import("sharp");
let _sharpPromise: Promise<SharpFn | null> | null = null;

/**
 * Actionable error for a missing/broken `sharp` native addon, thrown by the
 * float-RGB helpers when {@link loadSharp} resolves null.
 */
const SHARP_UNAVAILABLE_MESSAGE =
  "The 'sharp' image codec is unavailable. It is a native addon that must be " +
  "installed for this runtime (run `npm install sharp` in the server install, " +
  "or reinstall it for your platform/arch). This node requires sharp and has no " +
  "browser/edge fallback.";

/**
 * Lazily load `sharp`. Resolves `null` — never throws an opaque module-load
 * error — off Node (browser/edge) or when the Node native addon can't load. A
 * rejected attempt is never cached. Callers throw a clear error on null.
 */
async function loadSharp(): Promise<SharpFn | null> {
  if (!_sharpPromise) {
    // Let a thrown import (broken addon) reject the attempt so the `.catch`
    // below drops it from the cache and a later, fixed install is picked up. A
    // legitimate off-Node `null` resolves and is cached.
    const attempt = (async (): Promise<SharpFn | null> => {
      const mod = await importHidden<SharpFn | { default: SharpFn }>("sharp");
      if (!mod) return null;
      return (mod as { default?: SharpFn }).default ?? (mod as SharpFn);
    })();
    _sharpPromise = attempt;
    attempt.catch(() => {
      if (_sharpPromise === attempt) _sharpPromise = null;
    });
  }
  // Never surface an opaque module-load error; report a broken addon as `null`.
  return _sharpPromise.catch(() => null);
}

export type ImageRefLike = {
  data?: string | Uint8Array;
  uri?: string;
  asset_id?: string | null;
  type?: string;
  [k: string]: unknown;
};

export type FloatRGBResult = {
  data: Float32Array;
  width: number;
  height: number;
  alpha?: Uint8Array;
};

const ASSET_EXTENSIONS: Record<string, string[]> = {
  image: ["png", "jpg", "jpeg", "webp"],
  audio: ["mp3", "wav", "ogg"],
  video: ["mp4", "webm"]
};

export async function decodeImage(
  ref: unknown,
  context?: ProcessingContext
): Promise<Buffer | null> {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as ImageRefLike;

  // Inline data (base64 or Uint8Array)
  if (r.data) {
    if (r.data instanceof Uint8Array) return Buffer.from(r.data);
    if (typeof r.data === "string") return Buffer.from(r.data, "base64");
  }

  // Resolve from storage via asset_id or uri
  if (context?.storage) {
    const candidates: string[] = [];
    if (r.uri) candidates.push(r.uri);
    if (r.asset_id) {
      const exts = ASSET_EXTENSIONS[(r.type ?? "image").toLowerCase()] ?? [
        "png"
      ];
      for (const ext of exts) {
        candidates.push(`/api/storage/${r.asset_id}.${ext}`);
      }
    }
    for (const candidate of candidates) {
      const stored = await context.storage.retrieve(candidate);
      if (stored !== null) {
        return Buffer.from(stored);
      }
    }
  }

  return null;
}

export function toRef(buf: Buffer, base?: unknown): Record<string, unknown> {
  const seed =
    base && typeof base === "object" ? (base as Record<string, unknown>) : {};
  return { ...seed, data: buf.toString("base64") };
}

export function pickImage(
  inputs: Record<string, unknown>,
  props: Record<string, unknown>
): unknown {
  const keys = [
    "image",
    "input",
    "source",
    "foreground",
    "background",
    "image1",
    "image2",
    "base_image",
    "mask"
  ];
  for (const key of keys) {
    if (key in inputs) return inputs[key];
  }
  for (const key of keys) {
    if (key in props) return props[key];
  }
  return null;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgbToHsv(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, v];
}

export function hsvToRgb(
  h: number,
  s: number,
  v: number
): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    case 5:
      return [v, p, q];
    default:
      return [0, 0, 0];
  }
}

export async function toFloatRGB(buf: Buffer): Promise<FloatRGBResult> {
  const sharp = await loadSharp();
  if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
  const img = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();
  const hasAlpha = meta.channels === 4 || meta.hasAlpha;
  const { data: raw, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const pixelCount = w * h;
  const rgb = new Float32Array(pixelCount * 3);
  let alpha: Uint8Array | undefined;
  if (hasAlpha) {
    alpha = new Uint8Array(pixelCount);
  }
  for (let i = 0; i < pixelCount; i++) {
    rgb[i * 3] = raw[i * 4] / 255;
    rgb[i * 3 + 1] = raw[i * 4 + 1] / 255;
    rgb[i * 3 + 2] = raw[i * 4 + 2] / 255;
    if (alpha) alpha[i] = raw[i * 4 + 3];
  }
  return { data: rgb, width: w, height: h, alpha };
}

export async function fromFloatRGB(
  data: Float32Array,
  width: number,
  height: number,
  alpha?: Uint8Array
): Promise<Buffer> {
  const pixelCount = width * height;
  const channels = alpha ? 4 : 3;
  const out = Buffer.alloc(pixelCount * channels);
  for (let i = 0; i < pixelCount; i++) {
    out[i * channels] = Math.round(clamp(data[i * 3], 0, 1) * 255);
    out[i * channels + 1] = Math.round(clamp(data[i * 3 + 1], 0, 1) * 255);
    out[i * channels + 2] = Math.round(clamp(data[i * 3 + 2], 0, 1) * 255);
    if (alpha) out[i * channels + 3] = alpha[i];
  }
  const sharp = await loadSharp();
  if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

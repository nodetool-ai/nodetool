/**
 * Host-side media engine behind the sandbox's `image` and `canvas` bridges.
 *
 * The guest never sees a canvas, a context, or an image object — those are host
 * resources with methods, and the bridge contract is plain data in, plain data
 * out. So the boundary carries encoded image bytes (`Uint8Array`) and, for
 * drawing, a *draw list*: the guest records ordinary Canvas 2D calls
 * synchronously and ships them in one {@link CanvasRenderSpec}, which this
 * module replays against a real 2D context and encodes.
 *
 * Two backends implement the same surface, picked at first use:
 *
 * - **Node** — `@napi-rs/canvas` (Skia). Imported through `importHidden`, so no
 *   bundler tries to resolve the native addon into a browser graph. It is
 *   already staged as an external in `scripts/bundle-backend.mjs`, so the
 *   packaged Electron backend resolves it at runtime.
 * - **Browser / worker** — `OffscreenCanvas` + `createImageBitmap` +
 *   `convertToBlob`, so the in-browser runner draws with the platform's own
 *   canvas instead of shipping a second copy of Skia.
 *
 * Neither backend is ever handed to the guest.
 */

import { importHidden } from "@nodetool-ai/config";
import {
  CANVAS_GRADIENT_MARKER,
  CANVAS_METHODS,
  CANVAS_PROPERTIES
} from "./sandbox-canvas-api.js";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Largest encoded image the `image.*` bridges accept. */
export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;
/** Pixel ceiling for a decoded image or a rendered canvas. */
export const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;
/** Longest edge any single surface may have. */
export const MAX_IMAGE_DIMENSION = 16_384;
/**
 * Pixel ceiling for `image.decode`. Lower than {@link MAX_IMAGE_PIXELS}: raw
 * RGBA is four bytes a pixel and crosses the boundary base64-encoded, so the
 * guest pays roughly 5.4x the pixel count in transferred characters.
 */
export const MAX_DECODE_PIXELS = 8 * 1024 * 1024;
/**
 * Draw operations replayed per `canvas` render. The ceiling is generous
 * against what the boundary can carry, not against Skia: each recorded op is
 * a small object marshaled out of the guest, which costs around a millisecond,
 * so a draw list this long already spends most of a default run's budget
 * getting to the host. Composing several images with `image.composite` beats
 * drawing tens of thousands of primitives.
 */
export const MAX_CANVAS_OPS = 10_000;
/** Composite layers accepted by one `image.composite` call. */
export const MAX_COMPOSITE_LAYERS = 64;
/** Default JPEG/WebP/AVIF quality when the caller names none. */
export const DEFAULT_IMAGE_QUALITY = 0.92;

export const IMAGE_FORMATS = ["png", "jpeg", "webp", "avif"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

/** The subset of `CanvasRenderingContext2D` both backends satisfy. */
export interface MediaContext2D {
  [key: string]: unknown;
  drawImage: (...args: unknown[]) => void;
  measureText: (text: string) => { width: number } & Record<string, unknown>;
  createLinearGradient: (...args: number[]) => MediaGradient;
  createRadialGradient: (...args: number[]) => MediaGradient;
  createConicGradient?: (...args: number[]) => MediaGradient;
  getImageData: (
    x: number,
    y: number,
    w: number,
    h: number
  ) => { data: ArrayLike<number> };
  putImageData: (data: unknown, x: number, y: number) => void;
}

export interface MediaGradient {
  addColorStop: (offset: number, color: string) => void;
}

export interface MediaSurface {
  readonly width: number;
  readonly height: number;
  readonly ctx: MediaContext2D;
}

/** A decoded image the backend's `drawImage` accepts. */
export interface MediaImage {
  readonly width: number;
  readonly height: number;
  readonly handle: unknown;
}

export interface MediaBackend {
  createSurface(width: number, height: number): MediaSurface;
  decode(bytes: Uint8Array): Promise<MediaImage>;
  /** Wrap raw RGBA pixels as a drawable of the given size. */
  fromPixels(
    pixels: Uint8Array,
    width: number,
    height: number
  ): Promise<MediaImage>;
  encode(
    surface: MediaSurface,
    format: ImageFormat,
    quality: number
  ): Promise<Uint8Array>;
}

declare const canvasImageDataBrand: unique symbol;

/**
 * A canvas `ImageData`. The backend constructs it and `putImageData` consumes
 * it; nothing on this side reads its fields, so it is opaque by contract
 * rather than by omission.
 */
interface CanvasImageData {
  readonly [canvasImageDataBrand]?: never;
}

interface NapiCanvasModule {
  createCanvas: (
    w: number,
    h: number
  ) => {
    width: number;
    height: number;
    getContext: (kind: "2d") => MediaContext2D;
    encode: (format: string, quality?: number) => Promise<Uint8Array>;
  };
  loadImage: (
    input: Uint8Array
  ) => Promise<{ width: number; height: number } & object>;
  ImageData: new (
    data: Uint8ClampedArray,
    width: number,
    height: number
  ) => CanvasImageData;
}

function napiQuality(format: ImageFormat, quality: number): number | undefined {
  // Skia takes 0-100 for the lossy encoders and ignores it for PNG.
  if (format === "png") return undefined;
  return Math.round(Math.min(Math.max(quality, 0), 1) * 100);
}

function createNodeBackend(mod: NapiCanvasModule): MediaBackend {
  return {
    createSurface(width, height) {
      const canvas = mod.createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      return {
        width,
        height,
        ctx,
        // Kept off the public interface — `encode` reaches it through the
        // closure below rather than widening MediaSurface with a backend type.
        ...({ __canvas: canvas } as Record<string, unknown>)
      } as MediaSurface;
    },
    async decode(bytes) {
      const img = await mod.loadImage(bytes);
      return { width: img.width, height: img.height, handle: img };
    },
    async fromPixels(pixels, width, height) {
      const canvas = mod.createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      const clamped = new Uint8ClampedArray(
        pixels.buffer.slice(
          pixels.byteOffset,
          pixels.byteOffset + pixels.byteLength
        ) as ArrayBuffer
      );
      ctx.putImageData(new mod.ImageData(clamped, width, height), 0, 0);
      return { width, height, handle: canvas };
    },
    async encode(surface, format, quality) {
      const canvas = (surface as unknown as { __canvas: NapiSurfaceCanvas })
        .__canvas;
      const q = napiQuality(format, quality);
      const out =
        q === undefined
          ? await canvas.encode(format)
          : await canvas.encode(format, q);
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
  };
}

type NapiSurfaceCanvas = ReturnType<NapiCanvasModule["createCanvas"]>;

interface OffscreenCanvasLike {
  width: number;
  height: number;
  getContext: (kind: "2d") => MediaContext2D | null;
  convertToBlob: (opts?: {
    type?: string;
    quality?: number;
  }) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>;
}

function createBrowserBackend(): MediaBackend {
  const make = (w: number, h: number): OffscreenCanvasLike =>
    new (globalThis as unknown as {
      OffscreenCanvas: new (w: number, h: number) => OffscreenCanvasLike;
    }).OffscreenCanvas(w, h);
  const createBitmap = (
    globalThis as unknown as {
      createImageBitmap: (source: unknown) => Promise<{
        width: number;
        height: number;
      }>;
    }
  ).createImageBitmap;

  return {
    createSurface(width, height) {
      const canvas = make(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d canvas context unavailable");
      return {
        width,
        height,
        ctx,
        ...({ __canvas: canvas } as Record<string, unknown>)
      } as MediaSurface;
    },
    async decode(bytes) {
      const blob = new Blob([bytes as BlobPart]);
      const bitmap = await createBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, handle: bitmap };
    },
    async fromPixels(pixels, width, height) {
      const clamped = new Uint8ClampedArray(
        pixels.buffer.slice(
          pixels.byteOffset,
          pixels.byteOffset + pixels.byteLength
        ) as ArrayBuffer
      );
      const data = new ImageData(clamped, width, height);
      const bitmap = await createBitmap(data);
      return { width, height, handle: bitmap };
    },
    async encode(surface, format, quality) {
      const canvas = (surface as unknown as { __canvas: OffscreenCanvasLike })
        .__canvas;
      const blob = await canvas.convertToBlob({
        type: `image/${format}`,
        quality
      });
      return new Uint8Array(await blob.arrayBuffer());
    }
  };
}

let backendPromise: Promise<MediaBackend> | null = null;

/** Resolve the platform's canvas backend. Cached — the choice cannot change. */
export async function getMediaBackend(): Promise<MediaBackend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      const mod = await importHidden<NapiCanvasModule>("@napi-rs/canvas").catch(
        () => null
      );
      if (mod && typeof mod.createCanvas === "function") {
        return createNodeBackend(mod);
      }
      if (
        typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas ===
        "function"
      ) {
        return createBrowserBackend();
      }
      throw new Error(
        "image and canvas need a 2D canvas: install @napi-rs/canvas on Node, " +
          "or run somewhere with OffscreenCanvas"
      );
    })();
    // A failed probe must not be cached as a rejected promise forever.
    backendPromise.catch(() => {
      backendPromise = null;
    });
  }
  return backendPromise;
}

/** Test seam: force a backend (or clear it with `null`). */
export function setMediaBackend(backend: MediaBackend | null): void {
  backendPromise = backend ? Promise.resolve(backend) : null;
}

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

/**
 * Accept the two shapes bytes arrive in. Guest `Uint8Array`s are marshaled
 * natively by the typed-array serializers, but a value that travelled through
 * a plain-object round trip arrives numeric-keyed — coerce rather than refuse,
 * so `image.resize(JSON.parse(...).bytes)` behaves.
 */
export function asImageBytes(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const length = Number(record.length ?? -1);
    if (Number.isInteger(length) && length >= 0) {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = Number(record[i]) & 255;
      return out;
    }
  }
  throw new Error(`${label} must be a Uint8Array of encoded image bytes`);
}

/**
 * Call a context method by name, keeping the receiver. The backends' contexts
 * are native objects — pulling a method off one and calling it bare throws
 * "Illegal invocation" — and the index signature that makes the allowlist
 * replay possible hides that from the type checker.
 */
function invoke(ctx: MediaContext2D, name: string, ...args: unknown[]): void {
  const fn = ctx[name];
  if (typeof fn !== "function") {
    throw new Error(`canvas: "${name}" is not available in this runtime`);
  }
  (fn as (...a: unknown[]) => void).apply(ctx, args);
}

function assertInputSize(bytes: Uint8Array, label: string): void {
  if (bytes.length === 0) throw new Error(`${label}: image bytes are empty`);
  if (bytes.length > MAX_IMAGE_INPUT_BYTES) {
    throw new Error(
      `${label}: image exceeds the ${MAX_IMAGE_INPUT_BYTES} byte limit`
    );
  }
}

export function assertSurfaceSize(
  width: number,
  height: number,
  label: string
): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error(`${label}: width and height must be positive numbers`);
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(
      `${label}: no edge may exceed ${MAX_IMAGE_DIMENSION} pixels`
    );
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`${label}: exceeds the ${MAX_IMAGE_PIXELS} pixel limit`);
  }
}

function resolveFormat(value: unknown, label: string): ImageFormat {
  if (value === undefined || value === null) return "png";
  const name = String(value).toLowerCase();
  const normalized = name === "jpg" ? "jpeg" : name;
  if (!(IMAGE_FORMATS as readonly string[]).includes(normalized)) {
    throw new Error(
      `${label}: format must be one of ${IMAGE_FORMATS.join(", ")}`
    );
  }
  return normalized as ImageFormat;
}

function resolveQuality(value: unknown): number {
  const q = Number(value ?? DEFAULT_IMAGE_QUALITY);
  if (!Number.isFinite(q)) return DEFAULT_IMAGE_QUALITY;
  return Math.min(Math.max(q, 0), 1);
}

interface EncodeOptions {
  format: ImageFormat;
  quality: number;
}

function encodeOptions(
  options: Record<string, unknown> | undefined,
  label: string,
  fallbackFormat: ImageFormat = "png"
): EncodeOptions {
  const opts = options ?? {};
  return {
    format:
      opts.format === undefined
        ? fallbackFormat
        : resolveFormat(opts.format, label),
    quality: resolveQuality(opts.quality)
  };
}

/** Magic-number sniff — the encoder that produced the bytes, before decoding. */
export function sniffImageFormat(bytes: Uint8Array): string {
  const at = (i: number): number => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return "png";
  }
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return "gif";
  if (at(0) === 0x42 && at(1) === 0x4d) return "bmp";
  const tag = (offset: number, text: string): boolean =>
    [...text].every((ch, i) => at(offset + i) === ch.charCodeAt(0));
  if (tag(0, "RIFF") && tag(8, "WEBP")) return "webp";
  if (tag(4, "ftyp")) {
    if (tag(8, "avif") || tag(8, "avis")) return "avif";
    if (tag(8, "heic") || tag(8, "heix") || tag(8, "mif1")) return "heic";
  }
  if (tag(0, "<svg") || tag(0, "<?xml")) return "svg";
  return "unknown";
}

async function decodeImage(
  bytes: Uint8Array,
  label: string
): Promise<{ backend: MediaBackend; image: MediaImage }> {
  assertInputSize(bytes, label);
  const backend = await getMediaBackend();
  let image: MediaImage;
  try {
    image = await backend.decode(bytes);
  } catch (e) {
    throw new Error(
      `${label}: could not decode the image (${sniffImageFormat(bytes)}) — ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
  assertSurfaceSize(image.width, image.height, label);
  return { backend, image };
}

/** Render `draw` onto a fresh surface and encode it. */
async function renderTo(
  backend: MediaBackend,
  width: number,
  height: number,
  encode: EncodeOptions,
  background: string | undefined,
  draw: (ctx: MediaContext2D) => void
): Promise<Uint8Array> {
  const surface = backend.createSurface(Math.round(width), Math.round(height));
  const ctx = surface.ctx;
  // JPEG has no alpha: without a ground, transparent pixels encode as black.
  const ground =
    background ?? (encode.format === "jpeg" ? "#ffffff" : undefined);
  if (ground) {
    ctx.fillStyle = ground;
    invoke(ctx, "fillRect", 0, 0, surface.width, surface.height);
  }
  draw(ctx);
  return backend.encode(surface, encode.format, encode.quality);
}

// ---------------------------------------------------------------------------
// image.* bridge
// ---------------------------------------------------------------------------

type Fit = "cover" | "contain" | "fill";

function resolveFit(value: unknown, label: string): Fit {
  if (value === undefined || value === null) return "contain";
  const fit = String(value);
  if (fit !== "cover" && fit !== "contain" && fit !== "fill") {
    throw new Error(`${label}: fit must be cover, contain or fill`);
  }
  return fit;
}

/**
 * Source rectangle and destination rectangle for a fit-constrained draw.
 * `cover` crops the source, `contain` letterboxes into the destination,
 * `fill` stretches.
 */
function fitRects(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  fit: Fit
): [number, number, number, number, number, number, number, number] {
  if (fit === "fill") return [0, 0, sw, sh, 0, 0, dw, dh];
  if (fit === "cover") {
    const scale = Math.max(dw / sw, dh / sh);
    const cw = Math.min(sw, dw / scale);
    const ch = Math.min(sh, dh / scale);
    return [(sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, dw, dh];
  }
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return [0, 0, sw, sh, (dw - w) / 2, (dh - h) / 2, w, h];
}

const FILTER_BUILDERS: Record<string, (value: number) => string> = {
  brightness: (v) => `brightness(${v})`,
  contrast: (v) => `contrast(${v})`,
  saturate: (v) => `saturate(${v})`,
  grayscale: (v) => `grayscale(${v})`,
  sepia: (v) => `sepia(${v})`,
  invert: (v) => `invert(${v})`,
  blur: (v) => `blur(${v}px)`,
  hueRotate: (v) => `hue-rotate(${v}deg)`,
  opacity: (v) => `opacity(${v})`
};

function buildFilter(options: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, build] of Object.entries(FILTER_BUILDERS)) {
    const raw = options[key];
    if (raw === undefined || raw === null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`image.adjust: ${key} must be a number`);
    }
    parts.push(build(value));
  }
  return parts.join(" ");
}

export interface ImageBridge {
  info(bytes: unknown): Promise<Record<string, unknown>>;
  decode(bytes: unknown): Promise<Record<string, unknown>>;
  stats(bytes: unknown): Promise<Record<string, unknown>>;
  blank(
    width: unknown,
    height: unknown,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  pad(bytes: unknown, options?: Record<string, unknown>): Promise<Uint8Array>;
  grid(images: unknown, options?: Record<string, unknown>): Promise<Uint8Array>;
  resize(bytes: unknown, options?: Record<string, unknown>): Promise<Uint8Array>;
  crop(bytes: unknown, options?: Record<string, unknown>): Promise<Uint8Array>;
  rotate(
    bytes: unknown,
    degrees: unknown,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  flip(bytes: unknown, options?: Record<string, unknown>): Promise<Uint8Array>;
  adjust(bytes: unknown, options?: Record<string, unknown>): Promise<Uint8Array>;
  composite(
    bytes: unknown,
    layers: unknown,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  convert(
    bytes: unknown,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
}

/**
 * The `image` namespace. Every member takes and returns encoded image bytes,
 * so results chain (`resize` → `adjust` → `convert`) without the guest ever
 * holding a decoded surface.
 */
/**
 * Encode raw RGBA pixels — host-side only, deliberately not on the guest
 * bridge.
 *
 * This is what `image.encode` used to expose. The capability is fine; offering
 * it to the *guest* was not, because the pixels had to be built in the guest
 * heap and shipped across the boundary, and every observed use was a backdrop:
 * `width*height*4` zeroed bytes moved to produce a few kilobytes of PNG. The
 * guest now asks for `image.blank` instead. Host code (fixtures, backends,
 * anything already holding pixels) keeps the direct path.
 */
export async function encodePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options?: Record<string, unknown>
): Promise<Uint8Array> {
  assertSurfaceSize(width, height, "encodePixels");
  if (pixels.length !== width * height * 4) {
    throw new Error(
      `encodePixels: expected ${width * height * 4} RGBA bytes, got ${pixels.length}`
    );
  }
  const encode = encodeOptions(options, "encodePixels");
  const backend = await getMediaBackend();
  const image = await backend.fromPixels(pixels, width, height);
  return renderTo(
    backend,
    width,
    height,
    encode,
    options?.background as string | undefined,
    (ctx) => ctx.drawImage(image.handle, 0, 0)
  );
}

export function createImageBridge(): ImageBridge {
  return {
    async info(bytes) {
      const input = asImageBytes(bytes, "image.info: bytes");
      const { image } = await decodeImage(input, "image.info");
      return {
        width: image.width,
        height: image.height,
        format: sniffImageFormat(input),
        byteLength: input.length
      };
    },

    async decode(bytes) {
      const input = asImageBytes(bytes, "image.decode: bytes");
      const { backend, image } = await decodeImage(input, "image.decode");
      if (image.width * image.height > MAX_DECODE_PIXELS) {
        throw new Error(
          `image.decode: ${image.width}x${image.height} exceeds the ` +
            `${MAX_DECODE_PIXELS} pixel limit — resize first, or work on ` +
            "encoded bytes"
        );
      }
      const surface = backend.createSurface(image.width, image.height);
      surface.ctx.drawImage(image.handle, 0, 0);
      const data = surface.ctx.getImageData(0, 0, image.width, image.height);
      return {
        width: image.width,
        height: image.height,
        pixels: Uint8Array.from(data.data as ArrayLike<number>)
      };
    },

    /**
     * Per-channel summary, computed host-side.
     *
     * Handles mean the guest no longer holds an image, which would leave it
     * unable to answer anything about one without `decode` pulling every pixel
     * across — reintroducing the cost handles removed. This answers the
     * questions a body actually asks (is it dark? is it flat? is it
     * transparent?) in a few dozen bytes.
     */
    async stats(bytes) {
      const input = asImageBytes(bytes, "image.stats: bytes");
      // No MAX_DECODE_PIXELS check: that bound exists because `decode` ships
      // every pixel to the guest. This reads them host-side and answers in a
      // hundred bytes, so the surface-size guard `decodeImage` already applies
      // is the only limit it needs.
      const { backend, image } = await decodeImage(input, "image.stats");
      const surface = backend.createSurface(image.width, image.height);
      surface.ctx.drawImage(image.handle, 0, 0);
      const data = surface.ctx.getImageData(0, 0, image.width, image.height);
      const px = data.data as ArrayLike<number>;
      const count = image.width * image.height;
      const sum = [0, 0, 0, 0];
      const min = [255, 255, 255, 255];
      const max = [0, 0, 0, 0];
      let luminance = 0;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < 4; c++) {
          const v = px[i * 4 + c];
          sum[c] += v;
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
        // Rec. 601 luma, the same weighting `adjust`'s grayscale uses.
        luminance += 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      }
      const channel = (c: number): Record<string, number> => ({
        mean: sum[c] / count,
        min: min[c],
        max: max[c]
      });
      return {
        width: image.width,
        height: image.height,
        pixels: count,
        luminance: luminance / count,
        opaque: min[3] === 255,
        channels: {
          r: channel(0),
          g: channel(1),
          b: channel(2),
          a: channel(3)
        }
      };
    },

    /**
     * A new surface, made host-side.
     *
     * This replaces `encode`, whose only observed use was allocating
     * `width*height*4` zeroed bytes in the guest to get a backdrop — 6 MB
     * shipped across the boundary to produce a 6 KB PNG, and the single
     * largest guest→host payload left in a normal image run.
     */
    async blank(width, height, options) {
      const w = Math.round(Number(width));
      const h = Math.round(Number(height));
      if (!Number.isFinite(w) || !Number.isFinite(h)) {
        throw new Error("image.blank: width and height must be numbers");
      }
      assertSurfaceSize(w, h, "image.blank");
      const encode = encodeOptions(options, "image.blank");
      const backend = await getMediaBackend();
      const color = options?.color as string | undefined;
      return renderTo(
        backend,
        w,
        h,
        encode,
        // `background` fills before the draw, which is exactly a solid fill.
        color ?? (options?.background as string | undefined),
        () => {}
      );
    },

    /**
     * Grow the canvas around an image without scaling it — the headroom a
     * composite needs, and what `nodetool.image.CanvasResize` does in a graph.
     * Building it by hand meant computing a bigger blank and compositing onto
     * it, which is three calls and an easy place to get the offsets wrong.
     */
    async pad(bytes, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.pad: bytes");
      const { backend, image } = await decodeImage(input, "image.pad");
      const all = Number(opts.all ?? 0);
      const side = (name: string): number => {
        const v = Number(opts[name] ?? all);
        if (!Number.isFinite(v) || v < 0) {
          throw new Error(`image.pad: ${name} must be a non-negative number`);
        }
        return Math.round(v);
      };
      const top = side("top");
      const right = side("right");
      const bottom = side("bottom");
      const left = side("left");
      const width = image.width + left + right;
      const height = image.height + top + bottom;
      assertSurfaceSize(width, height, "image.pad");
      const encode = encodeOptions(options, "image.pad");
      return renderTo(
        backend,
        width,
        height,
        encode,
        (opts.color as string | undefined) ??
          (opts.background as string | undefined),
        (ctx) => ctx.drawImage(image.handle, left, top)
      );
    },

    /**
     * Lay images out in a grid — the shape a caller usually means by "combine
     * these", and what `lib.grid.CombineImageGrid` does in a graph. Expressing
     * it with `composite` meant sizing a backdrop, computing every offset, and
     * getting the row wrap right; the failure that started all of this was a
     * two-image version of exactly that.
     */
    async grid(images, options) {
      const opts = options ?? {};
      if (!Array.isArray(images) || images.length === 0) {
        throw new Error("image.grid: pass a non-empty array of images");
      }
      if (images.length > MAX_COMPOSITE_LAYERS) {
        throw new Error(
          `image.grid: at most ${MAX_COMPOSITE_LAYERS} images, got ${images.length}`
        );
      }
      const backend = await getMediaBackend();
      const decoded: MediaImage[] = [];
      for (let i = 0; i < images.length; i++) {
        decoded.push(
          (await decodeImage(
            asImageBytes(images[i], `image.grid: images[${i}]`),
            `image.grid: images[${i}]`
          )).image
        );
      }
      const gap = Math.max(0, Math.round(Number(opts.gap ?? 0)));
      const columns = Math.max(
        1,
        Math.round(Number(opts.columns ?? decoded.length))
      );
      const rows = Math.ceil(decoded.length / columns);
      // Every cell is the largest input, so a grid stays aligned when the
      // sources differ in size; each image is centred in its cell.
      const cellWidth = Math.max(...decoded.map((d) => d.width));
      const cellHeight = Math.max(...decoded.map((d) => d.height));
      const width = columns * cellWidth + (columns - 1) * gap;
      const height = rows * cellHeight + (rows - 1) * gap;
      assertSurfaceSize(width, height, "image.grid");
      const encode = encodeOptions(options, "image.grid");
      return renderTo(
        backend,
        width,
        height,
        encode,
        (opts.background as string | undefined) ??
          (opts.color as string | undefined),
        (ctx) => {
          decoded.forEach((d, i) => {
            const col = i % columns;
            const row = Math.floor(i / columns);
            const x = col * (cellWidth + gap) + Math.round((cellWidth - d.width) / 2);
            const y = row * (cellHeight + gap) + Math.round((cellHeight - d.height) / 2);
            ctx.drawImage(d.handle, x, y);
          });
        }
      );
    },

    async resize(bytes, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.resize: bytes");
      const { backend, image } = await decodeImage(input, "image.resize");
      const fit = resolveFit(opts.fit, "image.resize");
      let width = opts.width === undefined ? NaN : Number(opts.width);
      let height = opts.height === undefined ? NaN : Number(opts.height);
      if (!Number.isFinite(width) && !Number.isFinite(height)) {
        throw new Error("image.resize: pass width, height, or both");
      }
      // One dimension given keeps the aspect ratio; the fit modes only matter
      // once the caller has pinned a box.
      if (!Number.isFinite(width)) {
        width = (image.width * height) / image.height;
      }
      if (!Number.isFinite(height)) {
        height = (image.height * width) / image.width;
      }
      width = Math.max(1, Math.round(width));
      height = Math.max(1, Math.round(height));
      assertSurfaceSize(width, height, "image.resize");
      const rect = fitRects(image.width, image.height, width, height, fit);
      const encode = encodeOptions(options, "image.resize");
      return renderTo(
        backend,
        width,
        height,
        encode,
        opts.background as string | undefined,
        (ctx) => ctx.drawImage(image.handle, ...rect)
      );
    },

    async crop(bytes, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.crop: bytes");
      const { backend, image } = await decodeImage(input, "image.crop");
      const x = Math.round(Number(opts.x ?? 0));
      const y = Math.round(Number(opts.y ?? 0));
      const width = Math.round(Number(opts.width ?? image.width - x));
      const height = Math.round(Number(opts.height ?? image.height - y));
      if (![x, y, width, height].every(Number.isFinite)) {
        throw new Error("image.crop: x, y, width and height must be numbers");
      }
      if (
        x < 0 ||
        y < 0 ||
        width < 1 ||
        height < 1 ||
        x + width > image.width ||
        y + height > image.height
      ) {
        throw new Error(
          `image.crop: rectangle ${width}x${height}+${x}+${y} falls outside ` +
            `the ${image.width}x${image.height} image`
        );
      }
      const encode = encodeOptions(options, "image.crop");
      return renderTo(
        backend,
        width,
        height,
        encode,
        opts.background as string | undefined,
        (ctx) =>
          ctx.drawImage(image.handle, x, y, width, height, 0, 0, width, height)
      );
    },

    async rotate(bytes, degrees, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.rotate: bytes");
      const angle = Number(degrees);
      if (!Number.isFinite(angle)) {
        throw new Error("image.rotate: degrees must be a number");
      }
      const { backend, image } = await decodeImage(input, "image.rotate");
      const radians = (angle * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      // The bounding box of the rotated rectangle, so nothing is clipped.
      const width = Math.max(1, Math.round(image.width * cos + image.height * sin));
      const height = Math.max(1, Math.round(image.width * sin + image.height * cos));
      assertSurfaceSize(width, height, "image.rotate");
      const encode = encodeOptions(options, "image.rotate");
      return renderTo(
        backend,
        width,
        height,
        encode,
        opts.background as string | undefined,
        (ctx) => {
          invoke(ctx, "translate", width / 2, height / 2);
          invoke(ctx, "rotate", radians);
          ctx.drawImage(image.handle, -image.width / 2, -image.height / 2);
        }
      );
    },

    async flip(bytes, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.flip: bytes");
      const horizontal = opts.horizontal === undefined ? true : Boolean(opts.horizontal);
      const vertical = Boolean(opts.vertical);
      const { backend, image } = await decodeImage(input, "image.flip");
      const encode = encodeOptions(options, "image.flip");
      return renderTo(
        backend,
        image.width,
        image.height,
        encode,
        opts.background as string | undefined,
        (ctx) => {
          invoke(
            ctx,
            "translate",
            horizontal ? image.width : 0,
            vertical ? image.height : 0
          );
          invoke(ctx, "scale", horizontal ? -1 : 1, vertical ? -1 : 1);
          ctx.drawImage(image.handle, 0, 0);
        }
      );
    },

    async adjust(bytes, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.adjust: bytes");
      const filter = buildFilter(opts);
      if (!filter) {
        throw new Error(
          `image.adjust: name at least one of ${Object.keys(
            FILTER_BUILDERS
          ).join(", ")}`
        );
      }
      const { backend, image } = await decodeImage(input, "image.adjust");
      const encode = encodeOptions(options, "image.adjust");
      return renderTo(
        backend,
        image.width,
        image.height,
        encode,
        opts.background as string | undefined,
        (ctx) => {
          ctx.filter = filter;
          ctx.drawImage(image.handle, 0, 0);
        }
      );
    },

    async composite(bytes, layers, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.composite: bytes");
      if (!Array.isArray(layers)) {
        throw new Error("image.composite: layers must be an array");
      }
      if (layers.length > MAX_COMPOSITE_LAYERS) {
        throw new Error(
          `image.composite: at most ${MAX_COMPOSITE_LAYERS} layers per call`
        );
      }
      const { backend, image } = await decodeImage(input, "image.composite");
      const drawn: {
        image: MediaImage;
        x: number;
        y: number;
        width: number;
        height: number;
        opacity: number;
        blendMode: string;
      }[] = [];
      for (const [index, entry] of layers.entries()) {
        const layer = (entry ?? {}) as Record<string, unknown>;
        const label = `image.composite: layer ${index}`;
        const layerBytes = asImageBytes(layer.image, `${label} image`);
        const decoded = await decodeImage(layerBytes, label);
        drawn.push({
          image: decoded.image,
          x: Number(layer.x ?? 0),
          y: Number(layer.y ?? 0),
          width: Number(layer.width ?? decoded.image.width),
          height: Number(layer.height ?? decoded.image.height),
          opacity:
            layer.opacity === undefined
              ? 1
              : Math.min(Math.max(Number(layer.opacity), 0), 1),
          blendMode: String(layer.blendMode ?? "source-over")
        });
      }
      const encode = encodeOptions(options, "image.composite");
      return renderTo(
        backend,
        image.width,
        image.height,
        encode,
        opts.background as string | undefined,
        (ctx) => {
          ctx.drawImage(image.handle, 0, 0);
          for (const layer of drawn) {
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(
              layer.image.handle,
              layer.x,
              layer.y,
              layer.width,
              layer.height
            );
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      );
    },

    async convert(bytes, options) {
      const opts = options ?? {};
      const input = asImageBytes(bytes, "image.convert: bytes");
      const { backend, image } = await decodeImage(input, "image.convert");
      const encode = encodeOptions(options, "image.convert");
      return renderTo(
        backend,
        image.width,
        image.height,
        encode,
        opts.background as string | undefined,
        (ctx) => ctx.drawImage(image.handle, 0, 0)
      );
    }
  };
}

/** The `image` namespace, built once — the members are pure closures. */
export const imageOps: ImageBridge = createImageBridge();

// ---------------------------------------------------------------------------
// canvas.* bridge
// ---------------------------------------------------------------------------

const PROPERTY_SET = new Set<string>(CANVAS_PROPERTIES);
const METHOD_SET = new Set<string>(CANVAS_METHODS);

export interface CanvasGradientSpec {
  readonly type: "linear" | "radial" | "conic";
  readonly coords: readonly number[];
  readonly stops: readonly (readonly [number, string])[];
}

export interface CanvasOp {
  readonly op: string;
  readonly args?: readonly unknown[];
}

export interface CanvasRenderSpec {
  readonly width: number;
  readonly height: number;
  readonly background?: string;
  readonly format?: string;
  readonly quality?: number;
  readonly gradients?: Record<string, CanvasGradientSpec>;
  readonly ops?: readonly CanvasOp[];
}

function buildGradients(
  ctx: MediaContext2D,
  specs: Record<string, CanvasGradientSpec> | undefined
): Map<string, MediaGradient> {
  const out = new Map<string, MediaGradient>();
  for (const [id, spec] of Object.entries(specs ?? {})) {
    const coords = (spec.coords ?? []).map(Number);
    let gradient: MediaGradient;
    if (spec.type === "linear") {
      gradient = ctx.createLinearGradient(...coords);
    } else if (spec.type === "radial") {
      gradient = ctx.createRadialGradient(...coords);
    } else if (spec.type === "conic" && ctx.createConicGradient) {
      gradient = ctx.createConicGradient(...coords);
    } else {
      throw new Error(`canvas: gradient type "${spec.type}" is not available`);
    }
    for (const [offset, color] of spec.stops ?? []) {
      gradient.addColorStop(Number(offset), String(color));
    }
    out.set(id, gradient);
  }
  return out;
}

/**
 * Replay a recorded draw list and return the encoded image.
 *
 * Ops are validated against the allowlists above, and `drawImage`'s first
 * argument is decoded here rather than in the guest — so the guest passes plain
 * image bytes and never holds a drawable.
 */
export async function renderCanvas(
  spec: CanvasRenderSpec
): Promise<Uint8Array> {
  if (!spec || typeof spec !== "object") {
    throw new Error("canvas.render: spec must be an object");
  }
  const width = Math.round(Number(spec.width));
  const height = Math.round(Number(spec.height));
  assertSurfaceSize(width, height, "canvas.render");
  const ops = spec.ops ?? [];
  if (!Array.isArray(ops)) {
    throw new Error("canvas.render: ops must be an array");
  }
  if (ops.length > MAX_CANVAS_OPS) {
    throw new Error(
      `canvas.render: ${ops.length} operations exceeds the ${MAX_CANVAS_OPS} limit`
    );
  }

  const backend = await getMediaBackend();
  const encode = encodeOptions(
    { format: spec.format, quality: spec.quality },
    "canvas.render"
  );

  // Decode every drawImage source up front: the replay itself is synchronous,
  // so an await inside it would interleave with nothing and only complicate
  // the transform stack's lifetime.
  const decoded = new Map<number, MediaImage>();
  for (const [index, entry] of ops.entries()) {
    if (entry?.op !== "drawImage") continue;
    const args = entry.args ?? [];
    const bytes = asImageBytes(args[0], `canvas.render: op ${index} image`);
    const { image } = await decodeImage(bytes, `canvas.render: op ${index}`);
    decoded.set(index, image);
  }

  const surface = backend.createSurface(width, height);
  const ctx = surface.ctx;
  const gradients = buildGradients(ctx, spec.gradients);
  const resolveStyle = (value: unknown): unknown => {
    if (value && typeof value === "object") {
      const id = (value as Record<string, unknown>)[CANVAS_GRADIENT_MARKER];
      if (typeof id === "string") {
        const gradient = gradients.get(id);
        if (!gradient) {
          throw new Error("canvas.render: unknown gradient reference");
        }
        return gradient;
      }
    }
    return value;
  };

  if (spec.background) {
    ctx.fillStyle = String(spec.background);
    invoke(ctx, "fillRect", 0, 0, width, height);
  } else if (encode.format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    invoke(ctx, "fillRect", 0, 0, width, height);
  }

  for (const [index, entry] of ops.entries()) {
    const name = entry?.op;
    const args = (entry?.args ?? []) as unknown[];
    if (name === "set") {
      const [property, value] = args;
      const key = String(property);
      if (!PROPERTY_SET.has(key)) {
        throw new Error(`canvas.render: op ${index} sets unknown property "${key}"`);
      }
      ctx[key] = resolveStyle(value);
      continue;
    }
    if (name === "drawImage") {
      const image = decoded.get(index);
      if (!image) {
        throw new Error(`canvas.render: op ${index} has no image`);
      }
      ctx.drawImage(image.handle, ...args.slice(1));
      continue;
    }
    if (!METHOD_SET.has(String(name))) {
      throw new Error(`canvas.render: op ${index} calls unknown method "${name}"`);
    }
    invoke(ctx, String(name), ...args);
  }

  return backend.encode(surface, encode.format, encode.quality);
}

/** Text metrics for a font, so the guest can lay text out before drawing it. */
export async function measureCanvasText(
  text: unknown,
  font: unknown
): Promise<Record<string, number>> {
  if (typeof text !== "string") {
    throw new Error("canvas.measureText: text must be a string");
  }
  const backend = await getMediaBackend();
  const surface = backend.createSurface(1, 1);
  if (font !== undefined && font !== null) {
    surface.ctx.font = String(font);
  }
  const metrics = surface.ctx.measureText(text);
  const pick = (key: string): number => {
    const value = (metrics as Record<string, unknown>)[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  return {
    width: pick("width"),
    actualBoundingBoxLeft: pick("actualBoundingBoxLeft"),
    actualBoundingBoxRight: pick("actualBoundingBoxRight"),
    actualBoundingBoxAscent: pick("actualBoundingBoxAscent"),
    actualBoundingBoxDescent: pick("actualBoundingBoxDescent"),
    fontBoundingBoxAscent: pick("fontBoundingBoxAscent"),
    fontBoundingBoxDescent: pick("fontBoundingBoxDescent")
  };
}

/**
 * Shared runner for `@nodetool-ai/gpu/pool` shader nodes (server-side Dawn).
 *
 * One helper per shader category builds a `BaseNode` per published or internal
 * module from the pool. Every node body funnels into {@link runShaderNode}
 * (single-pass) or {@link runRecipeNode} (multi-pass recipes), which decode
 * the input(s) via `decodeRgba`, upload to a `LabeledTexture`, run
 * `Executor.encode` / `RecipeRunner.encode` against the cached Dawn device,
 * and emit raw RGBA via {@link rawRgbaImageRef} so chained shader nodes skip
 * the PNG re-encode.
 *
 * Alpha conversion: the pool's contract is premultiplied between modules,
 * while the node-graph carries straight-alpha RGBA (`decodeRgba` /
 * `rawRgbaImageRef`). The helper premultiplies on upload and un-premultiplies
 * on readback so per-module shaders see canonical premultiplied throughout.
 */

import {
  createExecutor,
  createLabeledTexture,
  createRecipeRunner,
  type LabeledTexture,
  type RecipeModule,
  type ShaderModule
} from "@nodetool-ai/gpu/pool";
import { getNodeGPUDevice, createNodeGPUContext } from "@nodetool-ai/gpu/node";
import type { GPUContext } from "@nodetool-ai/gpu/pool";
import type { PropOptions } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { decodeRgba, rawRgbaImageRef } from "./image.js";

let cachedContext: Promise<GPUContext> | null = null;
// Cache the executor / recipe runner / registry at module scope so the
// sampler WeakMap inside the executor (and the recipe runner's internal
// pipeline cache) survives across node invocations. Re-creating them per
// call defeats those caches.
const cachedExecutor = createExecutor();
const cachedRecipeRunner = createRecipeRunner();
type ShaderRegistry = Awaited<ReturnType<typeof importRegistry>>;
let cachedRegistry: Promise<ShaderRegistry> | null = null;

async function importRegistry(): Promise<
  ReturnType<typeof import("@nodetool-ai/gpu/pool")["createDefaultRegistry"]>
> {
  const { createDefaultRegistry } = await import("@nodetool-ai/gpu/pool");
  return createDefaultRegistry();
}

async function getRegistry(): Promise<ShaderRegistry> {
  if (!cachedRegistry) cachedRegistry = importRegistry();
  return cachedRegistry;
}

async function getContext(): Promise<GPUContext> {
  if (!cachedContext) {
    cachedContext = createNodeGPUContext().catch((err) => {
      cachedContext = null;
      throw err;
    });
  }
  return cachedContext;
}

/** Texture usage that lets a labeled texture be sampled and copied from. */
const INPUT_USAGE =
  0x04 /* TEXTURE_BINDING */ |
  0x02 /* COPY_DST */ |
  0x01; /* COPY_SRC */

/** Texture usage for outputs the executor's fragment arm writes to. */
const OUTPUT_USAGE =
  0x10 /* RENDER_ATTACHMENT */ |
  0x04 /* TEXTURE_BINDING */ |
  0x01; /* COPY_SRC */

/** Texture usage for outputs the compute arm storage-writes to. */
const COMPUTE_OUTPUT_USAGE =
  0x08 /* STORAGE_BINDING */ |
  0x04 /* TEXTURE_BINDING */ |
  0x01; /* COPY_SRC */

/** Premultiply straight-alpha RGBA in place. Mutates and returns `pixels`. */
function premultiplyInPlace(pixels: Uint8Array): Uint8Array {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] / 255;
    pixels[i] = Math.round(pixels[i] * a);
    pixels[i + 1] = Math.round(pixels[i + 1] * a);
    pixels[i + 2] = Math.round(pixels[i + 2] * a);
  }
  return pixels;
}

/** Un-premultiply RGBA in place. Mutates and returns `pixels`. */
function unpremultiplyInPlace(pixels: Uint8Array): Uint8Array {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) continue;
    const inv = 255 / a;
    pixels[i] = Math.min(255, Math.round(pixels[i] * inv));
    pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] * inv));
    pixels[i + 2] = Math.min(255, Math.round(pixels[i + 2] * inv));
  }
  return pixels;
}

interface UploadedSource {
  texture: LabeledTexture;
  width: number;
  height: number;
}

async function uploadStraightAlpha(
  device: GPUDevice,
  image: unknown,
  context?: ProcessingContext,
  label = "shader-input"
): Promise<UploadedSource | null> {
  const decoded = await decodeRgba(image, context);
  if (decoded.rgba.length === 0) return null;
  const pixels = new Uint8Array(decoded.rgba);
  premultiplyInPlace(pixels);
  const texture = createLabeledTexture(device, {
    label,
    width: decoded.width,
    height: decoded.height,
    format: "rgba8unorm",
    usage: INPUT_USAGE
  });
  device.queue.writeTexture(
    { texture: texture.texture },
    pixels,
    { bytesPerRow: decoded.width * 4, rowsPerImage: decoded.height },
    { width: decoded.width, height: decoded.height }
  );
  return { texture, width: decoded.width, height: decoded.height };
}

/** Read a `rgba8unorm` `LabeledTexture` back to a straight-alpha RGBA buffer. */
async function readbackStraightAlpha(
  device: GPUDevice,
  texture: LabeledTexture
): Promise<Uint8Array> {
  const { width, height } = texture;
  // `copyTextureToBuffer` requires `bytesPerRow` aligned to 256.
  const rowStride = Math.ceil((width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: rowStride * height,
    usage: 0x09 /* COPY_DST | MAP_READ */
  });
  try {
    const encoder = device.createCommandEncoder({ label: "shader-readback" });
    encoder.copyTextureToBuffer(
      { texture: texture.texture },
      { buffer, bytesPerRow: rowStride, rowsPerImage: height },
      { width, height }
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      out.set(
        mapped.subarray(row * rowStride, row * rowStride + width * 4),
        row * width * 4
      );
    }
    buffer.unmap();
    return unpremultiplyInPlace(out);
  } finally {
    // Destroy even if mapAsync rejects (device lost / validation error).
    buffer.destroy();
  }
}

/** Options shared by both single-pass and recipe runners. */
export interface RunShaderOptions {
  /** Required when `io.output.dimensions === "host-specified"` or `"derived"`. */
  outputWidth?: number;
  outputHeight?: number;
  /** Extra labeled inputs (`mask`, `alpha`, `displacement`, `over`, …). */
  extraInputs?: Record<string, unknown>;
}

function resolveOutputDims(
  module: ShaderModule | RecipeModule,
  source: UploadedSource | null,
  opts: RunShaderOptions
): { width: number; height: number } {
  const declared = module.io.output.dimensions;
  if (declared === "host-specified" || declared === "derived") {
    const w = opts.outputWidth ?? source?.width;
    const h = opts.outputHeight ?? source?.height;
    if (!w || !h) {
      throw new Error(
        `${module.id}@${module.version}: outputWidth/outputHeight required (dimensions=${declared})`
      );
    }
    return { width: w, height: h };
  }
  // same-as:<inputName> — for the published catalog this is always "source".
  if (!source) {
    throw new Error(
      `${module.id}@${module.version}: dimensions=${declared} but no source input bound`
    );
  }
  return { width: source.width, height: source.height };
}

/**
 * Run a single-pass {@link ShaderModule} against the cached Dawn device. The
 * dispatch (fragment vs compute) is picked from `module.kind`.
 */
export async function runShaderNode(
  module: ShaderModule,
  params: Record<string, unknown>,
  sourceImage: unknown | null,
  opts: RunShaderOptions = {},
  context?: ProcessingContext
): Promise<ImageRef> {
  const device = await getNodeGPUDevice();
  const ctx = await getContext();

  const source = sourceImage
    ? await uploadStraightAlpha(device, sourceImage, context, `${module.id}-source`)
    : null;
  if (!source && module.io.inputs.source && !module.io.inputs.source.optional) {
    // No source bound and module requires one — return an empty ImageRef rather
    // than fail loud, mirroring lib-image-filter's "no-op when input is empty".
    return { type: "image", data: "" };
  }

  const inputs: Record<string, LabeledTexture> = {};
  if (source) inputs.source = source.texture;
  const acquiredExtras: LabeledTexture[] = [];
  for (const [name, ref] of Object.entries(opts.extraInputs ?? {})) {
    const uploaded = await uploadStraightAlpha(
      device,
      ref,
      context,
      `${module.id}-${name}`
    );
    if (uploaded) {
      inputs[name] = uploaded.texture;
      acquiredExtras.push(uploaded.texture);
    }
  }
  // Bail out before encoding if any *required* declared input is unbound —
  // executor.encode would throw "missing required input" otherwise. Mirrors
  // the source-missing no-op above so a stray null upstream produces an
  // empty image rather than a hard failure.
  for (const [name, contract] of Object.entries(module.io.inputs)) {
    if (contract.optional) continue;
    if (!inputs[name]) {
      source?.texture.destroy();
      for (const t of acquiredExtras) t.destroy();
      return { type: "image", data: "" };
    }
  }

  let output: LabeledTexture | undefined;
  try {
    const dims = resolveOutputDims(module, source, opts);
    output = createLabeledTexture(device, {
      label: `${module.id}-output`,
      width: dims.width,
      height: dims.height,
      format: "rgba8unorm",
      usage: module.kind === "compute" ? COMPUTE_OUTPUT_USAGE : OUTPUT_USAGE
    });

    const encoder = device.createCommandEncoder({ label: `${module.id}-encode` });
    if (module.kind === "compute") {
      const [wx, wy] = module.workgroupSize;
      cachedExecutor.encode({
        ctx,
        module,
        encoder,
        inputs,
        output,
        params: params as never,
        dispatch: {
          kind: "compute",
          x: Math.ceil(dims.width / wx),
          y: Math.ceil(dims.height / wy),
          z: 1
        }
      });
    } else {
      cachedExecutor.encode({
        ctx,
        module,
        encoder,
        inputs,
        output,
        params: params as never,
        dispatch: { kind: "fragment" }
      });
    }
    device.queue.submit([encoder.finish()]);

    const rgba = await readbackStraightAlpha(device, output);
    return rawRgbaImageRef(rgba, dims.width, dims.height);
  } finally {
    // Always release GPU textures, even if encode/submit/readback throws.
    source?.texture.destroy();
    for (const t of acquiredExtras) t.destroy();
    output?.destroy();
  }
}

/** Run a multi-pass {@link RecipeModule} (e.g. `filters.glow`, `mixer.dropShadow`). */
export async function runRecipeNode(
  recipe: RecipeModule,
  params: Record<string, unknown>,
  sourceImage: unknown | null,
  opts: RunShaderOptions = {},
  context?: ProcessingContext
): Promise<ImageRef> {
  const device = await getNodeGPUDevice();
  const ctx = await getContext();
  const registry = await getRegistry();

  const source = sourceImage
    ? await uploadStraightAlpha(device, sourceImage, context, `${recipe.id}-source`)
    : null;
  if (!source) {
    return { type: "image", data: "" };
  }

  const inputs: Record<string, LabeledTexture> = { source: source.texture };
  const acquiredExtras: LabeledTexture[] = [];
  for (const [name, ref] of Object.entries(opts.extraInputs ?? {})) {
    const uploaded = await uploadStraightAlpha(
      device,
      ref,
      context,
      `${recipe.id}-${name}`
    );
    if (uploaded) {
      inputs[name] = uploaded.texture;
      acquiredExtras.push(uploaded.texture);
    }
  }
  for (const [name, contract] of Object.entries(recipe.io.inputs)) {
    if (contract.optional) continue;
    if (!inputs[name]) {
      source.texture.destroy();
      for (const t of acquiredExtras) t.destroy();
      return { type: "image", data: "" };
    }
  }

  let output: LabeledTexture | undefined;
  try {
    const dims = resolveOutputDims(recipe, source, opts);
    output = createLabeledTexture(device, {
      label: `${recipe.id}-output`,
      width: dims.width,
      height: dims.height,
      format: "rgba8unorm",
      usage: OUTPUT_USAGE
    });

    const encoder = device.createCommandEncoder({ label: `${recipe.id}-encode` });
    cachedRecipeRunner.encode({
      ctx,
      module: recipe,
      encoder,
      inputs,
      output,
      params: params as never,
      registry
    });
    device.queue.submit([encoder.finish()]);

    const rgba = await readbackStraightAlpha(device, output);
    return rawRgbaImageRef(rgba, dims.width, dims.height);
  } finally {
    // Always release GPU textures, even if encode/submit/readback throws.
    source.texture.destroy();
    for (const t of acquiredExtras) t.destroy();
    output?.destroy();
  }
}

/**
 * Run a shader against an in-memory encoded image buffer (PNG / JPEG /
 * WebP / raw RGBA — anything `decodeRgba` accepts) and return a PNG
 * buffer. Used by the legacy sharp-based nodes (lib-image-filter,
 * lib-image-enhance, lib-image-color-grading, lib-image-draw) so their
 * pixel-processing path moves to the GPU while their I/O contract (base64
 * PNG out via `toRef`) stays unchanged. Codec work (decode/encode) stays
 * on sharp; only the pixel pipeline migrates.
 */
export async function runShaderOnPngBuffer(
  module: ShaderModule,
  params: Record<string, unknown>,
  encodedBuffer: Uint8Array,
  opts: RunShaderOptions = {},
  context?: ProcessingContext
): Promise<Uint8Array> {
  const ref = { type: "image", data: encodedBuffer };
  const out = await runShaderNode(module, params, ref, opts, context);
  return pngFromRawRgbaRef(out);
}

/** Same as {@link runShaderOnPngBuffer} but for {@link RecipeModule}s. */
export async function runRecipeOnPngBuffer(
  recipe: RecipeModule,
  params: Record<string, unknown>,
  encodedBuffer: Uint8Array,
  opts: RunShaderOptions = {},
  context?: ProcessingContext
): Promise<Uint8Array> {
  const ref = { type: "image", data: encodedBuffer };
  const out = await runRecipeNode(recipe, params, ref, opts, context);
  return pngFromRawRgbaRef(out);
}

/**
 * Encode a raw-RGBA `ImageRef` (the format `runShaderNode` returns) into
 * PNG bytes. If the ref isn't a raw-RGBA image (empty output, already
 * encoded, …) returns its `data` as a Uint8Array unchanged when possible.
 *
 * When the alpha plane is uniformly 255 we drop it before encoding so the
 * resulting PNG is 3-channel — matching the channel count that the legacy
 * sharp pipelines (which never explicitly added alpha) produced. Tests that
 * index raw bytes with `* 3` depend on this.
 */
async function pngFromRawRgbaRef(ref: ImageRef): Promise<Uint8Array> {
  const data = (ref as { data?: unknown }).data;
  const width = (ref as { width?: number }).width ?? 0;
  const height = (ref as { height?: number }).height ?? 0;
  if (!(data instanceof Uint8Array) || width === 0 || height === 0) {
    if (data instanceof Uint8Array) return data;
    return new Uint8Array();
  }
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default ?? sharpMod;

  let allOpaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      allOpaque = false;
      break;
    }
  }

  let pipeline = sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 }
  });
  if (allOpaque) {
    pipeline = pipeline.removeAlpha();
  }
  const png = await pipeline.png().toBuffer();
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
}

/* ------------------------------------------------------------------- *
 * Property factories — translate a module's TypeGPU param defaults    *
 * + paramUi hints into the `@prop` PropOptions shape node-sdk expects.*
 * ------------------------------------------------------------------- */

/** Standard `image` input slot for shader nodes consuming a source texture. */
export const IMAGE_PROP: PropOptions = {
  type: "image",
  default: {
    type: "image",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  },
  title: "Image",
  description: "Input image"
};

/** Optional second image slot (mask, alpha source, displacement map, …). */
export function extraImageProp(title: string, description: string): PropOptions {
  return {
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title,
    description
  };
}

/** Numeric scalar prop with min/max/step taken from a module's `paramUi`. */
export function floatProp(
  defaultValue: number,
  ui: { label?: string; notes?: string; min?: number; max?: number; step?: number } = {}
): PropOptions {
  return {
    type: "float",
    default: defaultValue,
    title: ui.label ?? "",
    description: ui.notes ?? "",
    ...(ui.min !== undefined ? { min: ui.min } : {}),
    ...(ui.max !== undefined ? { max: ui.max } : {})
  };
}

/** Integer-valued scalar (radius, mode enum, channel count). */
export function intProp(
  defaultValue: number,
  ui: { label?: string; notes?: string; min?: number; max?: number; step?: number } = {}
): PropOptions {
  return {
    type: "int",
    default: Math.round(defaultValue),
    title: ui.label ?? "",
    description: ui.notes ?? "",
    ...(ui.min !== undefined ? { min: ui.min } : {}),
    ...(ui.max !== undefined ? { max: ui.max } : {})
  };
}

/** Hex/CSS color prop. Stored as `{ type: "color", value: "#RRGGBBAA" }`. */
export function colorProp(
  defaultHex: string,
  ui: { label?: string; notes?: string } = {}
): PropOptions {
  return {
    type: "color",
    default: { type: "color", value: defaultHex },
    title: ui.label ?? "",
    description: ui.notes ?? ""
  };
}

/**
 * Parse a color value to a `[r, g, b, a]` tuple in [0,1].
 *
 * Accepted shapes:
 *   - `{ type: "color", value: "#rrggbb" | "#rrggbbaa" }` — the node-graph
 *     color prop form
 *   - `"#rrggbb"` / `"#rrggbbaa"` / `"rrggbb"` — bare hex strings
 *   - `[r, g, b, a]` / `[r, g, b]` — already-normalized floats in [0,1]
 *
 * Returns `fallback` for anything else, including hex strings that fail to
 * parse (NaN bytes).
 */
export function colorValueToVec4(
  color: unknown,
  fallback: [number, number, number, number] = [0, 0, 0, 1]
): [number, number, number, number] {
  if (Array.isArray(color)) {
    const [r, g, b, a] = color as unknown[];
    const out: [number, number, number, number] = [
      typeof r === "number" ? r : fallback[0],
      typeof g === "number" ? g : fallback[1],
      typeof b === "number" ? b : fallback[2],
      typeof a === "number" ? a : fallback[3]
    ];
    return out.some((v) => !Number.isFinite(v)) ? fallback : out;
  }
  let value: string | undefined;
  if (typeof color === "string") {
    value = color;
  } else if (color && typeof color === "object") {
    const maybe = (color as { value?: unknown }).value;
    if (typeof maybe === "string") value = maybe;
  }
  if (typeof value !== "string") return fallback;
  let hex = value.startsWith("#") ? value.slice(1) : value;
  // Expand 3-/4-digit shorthand (#fff, #fff8) by doubling each nibble.
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const parseByte = (s: string): number => parseInt(s, 16) / 255;
  let parsed: [number, number, number, number] | null = null;
  if (hex.length === 6) {
    parsed = [
      parseByte(hex.slice(0, 2)),
      parseByte(hex.slice(2, 4)),
      parseByte(hex.slice(4, 6)),
      1
    ];
  } else if (hex.length === 8) {
    parsed = [
      parseByte(hex.slice(0, 2)),
      parseByte(hex.slice(2, 4)),
      parseByte(hex.slice(4, 6)),
      parseByte(hex.slice(6, 8))
    ];
  }
  if (!parsed || parsed.some((v) => !Number.isFinite(v))) return fallback;
  return parsed;
}

/** Premultiply a straight-alpha `[r,g,b,a]` tuple. */
export function premultiplyVec4(
  rgba: [number, number, number, number]
): [number, number, number, number] {
  const [r, g, b, a] = rgba;
  return [r * a, g * a, b * a, a];
}

/**
 * Shared runner for `@nodetool-ai/gpu/pool` shader nodes.
 *
 * Environment-aware: acquires a Dawn `GPUContext` on Node and a
 * `navigator.gpu` context in the browser, so the same shader path runs
 * client-side (pure-browser sub-graphs) and server-side. Codec work (decode
 * input / encode PNG) goes through the sharp-free {@link import("./image-io.js")}
 * seam, which uses Canvas in the browser and `sharp` on Node.
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
  createRecipeRunner,
  type RecipeModule,
  type ShaderModule
} from "@nodetool-ai/gpu/pool";
import type { PropOptions } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import { isGpuTextureImage } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { decodeRgba, rawRgbaImageRef } from "./image-io.js";
import {
  GPU_TEXTURES_ENABLED,
  createLabeledTexture,
  getGpuContext,
  gpuTextureImageRef,
  premultiplyInPlace,
  readbackStraightAlpha,
  trackRunTexture,
  type LabeledTexture
} from "./gpu-device.js";

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

interface UploadedSource {
  texture: LabeledTexture;
  width: number;
  height: number;
  /**
   * True when the texture is borrowed from a GPU-texture input ref — it's owned
   * by the run's texture registry, not this node, so the caller must not
   * destroy it when the shader finishes.
   */
  borrowed: boolean;
}

async function uploadStraightAlpha(
  device: GPUDevice,
  image: unknown,
  context?: ProcessingContext,
  label = "shader-input"
): Promise<UploadedSource | null> {
  // A GPU-texture ImageRef is already a texture on this device — sample it
  // directly, skipping decode + upload (the whole point of GPU chaining).
  // Borrowed: the run owns it, so this node must not free it.
  if (isGpuTextureImage(image)) {
    return {
      texture: image.texture as LabeledTexture,
      width: image.width,
      height: image.height,
      borrowed: true
    };
  }
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
  return {
    texture,
    width: decoded.width,
    height: decoded.height,
    borrowed: false
  };
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
  const ctx = await getGpuContext();
  const device = ctx.device;

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
  // Textures this node OWNS (uploaded here) — freed when it finishes. Borrowed
  // GPU-texture inputs belong to the run's registry and are never freed here.
  const owned: LabeledTexture[] = [];
  if (source && !source.borrowed) owned.push(source.texture);
  for (const [name, ref] of Object.entries(opts.extraInputs ?? {})) {
    const uploaded = await uploadStraightAlpha(
      device,
      ref,
      context,
      `${module.id}-${name}`
    );
    if (uploaded) {
      inputs[name] = uploaded.texture;
      if (!uploaded.borrowed) owned.push(uploaded.texture);
    }
  }
  // Bail out before encoding if any *required* declared input is unbound —
  // executor.encode would throw "missing required input" otherwise. Mirrors
  // the source-missing no-op above so a stray null upstream produces an
  // empty image rather than a hard failure.
  for (const [name, contract] of Object.entries(module.io.inputs)) {
    if (contract.optional) continue;
    if (!inputs[name]) {
      for (const t of owned) t.destroy();
      return { type: "image", data: "" };
    }
  }

  // Keep the output on the GPU when chaining client-side (browser, inside a
  // run): the next node samples it directly and the run frees it later. On
  // Node/Dawn (server) or outside a run, read it back to a CPU RGBA buffer.
  const runId = context?.jobId;
  const keepOnGpu =
    GPU_TEXTURES_ENABLED && typeof runId === "string" && runId.length > 0;

  let output: LabeledTexture | undefined;
  let handedOff = false;
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

    if (keepOnGpu) {
      trackRunTexture(runId as string, output);
      handedOff = true;
      return gpuTextureImageRef(output, dims.width, dims.height);
    }
    const rgba = await readbackStraightAlpha(device, output);
    return rawRgbaImageRef(rgba, dims.width, dims.height);
  } finally {
    // Free this node's own textures (inputs it uploaded, and the output unless
    // it was handed off to the run as a GPU-texture ref).
    for (const t of owned) t.destroy();
    if (output && !handedOff) output.destroy();
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
  const ctx = await getGpuContext();
  const device = ctx.device;
  const registry = await getRegistry();

  const source = sourceImage
    ? await uploadStraightAlpha(device, sourceImage, context, `${recipe.id}-source`)
    : null;
  if (!source) {
    return { type: "image", data: "" };
  }

  const inputs: Record<string, LabeledTexture> = { source: source.texture };
  const owned: LabeledTexture[] = [];
  if (!source.borrowed) owned.push(source.texture);
  for (const [name, ref] of Object.entries(opts.extraInputs ?? {})) {
    const uploaded = await uploadStraightAlpha(
      device,
      ref,
      context,
      `${recipe.id}-${name}`
    );
    if (uploaded) {
      inputs[name] = uploaded.texture;
      if (!uploaded.borrowed) owned.push(uploaded.texture);
    }
  }
  for (const [name, contract] of Object.entries(recipe.io.inputs)) {
    if (contract.optional) continue;
    if (!inputs[name]) {
      for (const t of owned) t.destroy();
      return { type: "image", data: "" };
    }
  }

  const runId = context?.jobId;
  const keepOnGpu =
    GPU_TEXTURES_ENABLED && typeof runId === "string" && runId.length > 0;

  let output: LabeledTexture | undefined;
  let handedOff = false;
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

    if (keepOnGpu) {
      trackRunTexture(runId as string, output);
      handedOff = true;
      return gpuTextureImageRef(output, dims.width, dims.height);
    }
    const rgba = await readbackStraightAlpha(device, output);
    return rawRgbaImageRef(rgba, dims.width, dims.height);
  } finally {
    for (const t of owned) t.destroy();
    if (output && !handedOff) output.destroy();
  }
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

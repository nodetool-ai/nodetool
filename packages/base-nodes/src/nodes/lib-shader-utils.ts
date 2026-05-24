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
  buffer.destroy();
  return unpremultiplyInPlace(out);
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
  const executor = createExecutor();

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

  const dims = resolveOutputDims(module, source, opts);
  const output = createLabeledTexture(device, {
    label: `${module.id}-output`,
    width: dims.width,
    height: dims.height,
    format: "rgba8unorm",
    usage: module.kind === "compute" ? COMPUTE_OUTPUT_USAGE : OUTPUT_USAGE
  });

  const encoder = device.createCommandEncoder({ label: `${module.id}-encode` });
  if (module.kind === "compute") {
    const [wx, wy] = module.workgroupSize;
    executor.encode({
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
    executor.encode({
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
  source?.texture.destroy();
  for (const t of acquiredExtras) t.destroy();
  output.destroy();

  return rawRgbaImageRef(rgba, dims.width, dims.height);
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
  const runner = createRecipeRunner();
  const { createDefaultRegistry } = await import("@nodetool-ai/gpu/pool");
  const registry = createDefaultRegistry();

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

  const dims = resolveOutputDims(recipe, source, opts);
  const output = createLabeledTexture(device, {
    label: `${recipe.id}-output`,
    width: dims.width,
    height: dims.height,
    format: "rgba8unorm",
    usage: OUTPUT_USAGE
  });

  const encoder = device.createCommandEncoder({ label: `${recipe.id}-encode` });
  runner.encode({
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
  source.texture.destroy();
  for (const t of acquiredExtras) t.destroy();
  output.destroy();

  return rawRgbaImageRef(rgba, dims.width, dims.height);
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

/** Parse a `{ type: "color", value: "#rrggbb" | "#rrggbbaa" }` to a vec4f tuple. */
export function colorValueToVec4(
  color: unknown,
  fallback: [number, number, number, number] = [0, 0, 0, 1]
): [number, number, number, number] {
  if (!color || typeof color !== "object") return fallback;
  const value = (color as { value?: string }).value;
  if (typeof value !== "string") return fallback;
  const hex = value.startsWith("#") ? value.slice(1) : value;
  const parseByte = (s: string): number => parseInt(s, 16) / 255;
  if (hex.length === 6) {
    return [parseByte(hex.slice(0, 2)), parseByte(hex.slice(2, 4)), parseByte(hex.slice(4, 6)), 1];
  }
  if (hex.length === 8) {
    return [
      parseByte(hex.slice(0, 2)),
      parseByte(hex.slice(2, 4)),
      parseByte(hex.slice(4, 6)),
      parseByte(hex.slice(6, 8))
    ];
  }
  return fallback;
}

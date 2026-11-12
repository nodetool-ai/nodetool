// Guest half of the host gpu capability (src/host/gpu.cpp). Replaces the
// functions of @nodetool-ai/image-nodes that drive a WebGPU device
// (runShaderNode and runRecipeNode in lib-shader-utils, and the texture
// helpers of gpu-device) with calls to globalThis.__host.gpu, which runs the
// same shader modules on a native WebGPU device. guest/host/plugins.mjs makes
// the swap at bundle time.
//
// Textures stay on the host. A node's output is a GPU-texture ImageRef, as in
// the browser runner, whose `texture` is the host handle `{gpu: <id>}`. A
// downstream shader node samples it directly. The host reads it back to a PNG
// when a message carries it, and frees every texture of a run when the run
// ends. Inputs that are not textures are decoded and uploaded by the host.
//
// The control flow mirrors runShaderNode/runRecipeNode in
// packages/image-nodes/src/nodes/lib-shader-utils.ts: the same empty-image
// no-ops, warnings and output dimensions.
import { GPU_TEXTURE_MIME, isGpuTextureImage, isRawRgbaImage } from "@nodetool-ai/protocol";
import { loadMediaRefBytes } from "@nodetool-ai/runtime/media-ref-bytes";
import { base64ToBytes } from "@nodetool-ai/nodes-utils";
import catalogJson from "nodetool:gpu-catalog";

let ready = false;

/** The host capability, initialized with this bundle's shader catalog. */
function gpu() {
  const host = globalThis.__host?.gpu;
  if (!host) {
    throw new Error("WebGPU is not available: the native runner has no host gpu capability");
  }
  if (!ready) {
    const status = JSON.parse(host.init(catalogJson));
    if (!status.ok) throw new Error(`WebGPU is not available: ${status.error}`);
    ready = true;
  }
  return host;
}

/** Host texture id of a GPU-texture ImageRef this host made, or undefined. */
function hostTexture(image) {
  if (!isGpuTextureImage(image)) return undefined;
  const id = image.texture.gpu;
  if (typeof id !== "number") {
    throw new Error("GPU-texture image does not belong to the native runner's GPU");
  }
  return id;
}

function textureImageRef(id, width, height) {
  return { type: "image", mimeType: GPU_TEXTURE_MIME, texture: { gpu: id }, width, height };
}

const EMPTY = new Uint8Array();

function decodeDataUri(uri) {
  const comma = uri.indexOf(",");
  if (comma < 0) return EMPTY;
  const header = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  return header.includes(";base64")
    ? base64ToBytes(payload)
    : new TextEncoder().encode(decodeURIComponent(payload));
}

/**
 * Encoded bytes of an image ref: inline `data` (bytes, base64 or a data URI)
 * or a `data:` URI. Any other reference (asset://, storage, file and http
 * URIs) goes through loadMediaRefBytes from @nodetool-ai/runtime, which the
 * media capability provides. Empty for a ref that points at nothing.
 */
export async function encodedImageBytes(ref, context) {
  if (!ref || typeof ref !== "object") return EMPTY;
  const { data, uri, asset_id: assetId } = ref;
  if (data instanceof Uint8Array && data.length > 0) return data;
  if (typeof data === "string" && data.length > 0) {
    return data.startsWith("data:") ? decodeDataUri(data) : base64ToBytes(data);
  }
  if (typeof uri === "string" && uri.startsWith("data:")) return decodeDataUri(uri);
  if (!uri && !assetId) return EMPTY;
  return (await loadMediaRefBytes(ref, context)) ?? EMPTY;
}

/**
 * Puts an input image on the host GPU. Returns null for an empty image, as
 * uploadStraightAlpha does. A texture the host already holds is borrowed.
 */
async function upload(host, image, context, runId) {
  const id = hostTexture(image);
  if (id !== undefined) return { id, width: image.width, height: image.height, borrowed: true };
  const r = isRawRgbaImage(image)
    ? JSON.parse(host.uploadRgba(image.data, image.width, image.height, runId))
    : await encodedImageBytes(image, context).then((bytes) =>
        bytes.length === 0 ? null : JSON.parse(host.uploadEncoded(bytes, runId))
      );
  return r && { id: r.texture, width: r.width, height: r.height, borrowed: false };
}

function outputDims(module, source, opts) {
  const declared = module.io.output.dimensions;
  if (declared === "host-specified" || declared === "derived") {
    const w = opts.outputWidth ?? source?.width;
    const h = opts.outputHeight ?? source?.height;
    if (!w || !h) {
      throw new Error(`${module.id}@${module.version}: outputWidth/outputHeight required (dimensions=${declared})`);
    }
    return { width: w, height: h };
  }
  if (!source) {
    throw new Error(`${module.id}@${module.version}: dimensions=${declared} but no source input bound`);
  }
  return { width: source.width, height: source.height };
}

/** JSON for the host: non-finite numbers travel as strings, which the host reads as JavaScript's Number() would. */
function paramsJson(params) {
  return JSON.stringify(params ?? {}, (_key, value) =>
    typeof value === "number" && !Number.isFinite(value) ? String(value) : value
  );
}

function missingInput(module, name) {
  console.warn(`${module.id}: required input "${name}" missing — emitting empty image.`);
  return { type: "image", data: "" };
}

async function run(module, params, sourceImage, opts, context, recipe) {
  const host = gpu();
  const runId = typeof context?.jobId === "string" ? context.jobId : "";
  const owned = [];
  try {
    const source = sourceImage ? await upload(host, sourceImage, context, runId) : null;
    if (source && !source.borrowed) owned.push(source.id);
    if (!source && (recipe || (module.io.inputs.source && !module.io.inputs.source.optional))) {
      return missingInput(module, "source");
    }
    const inputs = {};
    if (source) inputs.source = source.id;
    for (const [name, ref] of Object.entries(opts.extraInputs ?? {})) {
      const uploaded = await upload(host, ref, context, runId);
      if (uploaded) {
        inputs[name] = uploaded.id;
        if (!uploaded.borrowed) owned.push(uploaded.id);
      }
    }
    for (const [name, contract] of Object.entries(module.io.inputs)) {
      if (!contract.optional && inputs[name] === undefined) return missingInput(module, name);
    }
    const dims = outputDims(module, source, opts);
    const request = JSON.stringify({
      module: `${module.id}@${module.version}`,
      inputs,
      width: dims.width,
      height: dims.height,
      run: runId
    });
    const out = JSON.parse(host.run(request, paramsJson(params)));
    return textureImageRef(out.texture, dims.width, dims.height);
  } finally {
    for (const id of owned) host.release(id);
  }
}

/** runShaderNode from lib-shader-utils: one shader module on the host GPU. */
export function runShaderNode(module, params, sourceImage, opts = {}, context) {
  return run(module, params, sourceImage, opts, context, false);
}

/** runRecipeNode from lib-shader-utils: a multi-pass recipe on the host GPU. */
export function runRecipeNode(recipe, params, sourceImage, opts = {}, context) {
  return run(recipe, params, sourceImage, opts, context, true);
}

/** gpu-device's getGpuContext: node code that wants a GPUDevice of its own. */
export async function getGpuContext() {
  const { createNodeGPUContext } = await import('./gpu-node.mjs');
  return createNodeGPUContext();
}

/** Straight-alpha RGBA of a GPU-texture ImageRef. */
export async function readbackTextureRef(ref) {
  const id = hostTexture(ref);
  if (id === undefined) throw new Error("not a GPU-texture image");
  const r = gpu().readback(id);
  return { rgba: r.rgba, width: ref.width, height: ref.height };
}

export function releaseRunTextures(runId) {
  globalThis.__host?.gpu?.releaseRun(String(runId));
}

export function trackedRunTextureCount() {
  return globalThis.__host?.gpu ? globalThis.__host.gpu.liveTextures() : 0;
}

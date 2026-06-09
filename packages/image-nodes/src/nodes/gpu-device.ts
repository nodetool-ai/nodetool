/// <reference lib="dom" />
/**
 * Shared GPU device + texture lifecycle for the image shader nodes.
 *
 * Owns the single cached `GPUContext` (Dawn on Node, `navigator.gpu` in the
 * browser/worker) so every shader op and every read-back uses the same device,
 * and hosts the run-scoped texture registry behind the in-flight GPU-texture
 * `ImageRef` (see {@link gpuTextureImageRef}). Sits below both `lib-shader-utils`
 * (which runs shaders) and `image-io` (which decodes/encodes), so the
 * texture-readback seam is reachable from either without a circular import.
 *
 * GPU-texture refs exist only in the browser, for one run, and are never
 * serialized: `releaseRunTextures(jobId)` frees them when the runner ends a job,
 * and any boundary (transport / CPU / server) resolves them to bytes first.
 */
import {
  createLabeledTexture,
  type LabeledTexture,
  type GPUContext
} from "@nodetool-ai/gpu/pool";
import { createNodeGPUContext } from "@nodetool-ai/gpu/node";
import { createBrowserGPUContext } from "@nodetool-ai/gpu/webgpu";
import { IS_NODE } from "@nodetool-ai/config";
import { GPU_TEXTURE_MIME, type ImageRef } from "@nodetool-ai/protocol";

export { createLabeledTexture };
export type { LabeledTexture };

/** GPU-texture refs are browser-only; Node/Dawn always reads back to RGBA. */
export const GPU_TEXTURES_ENABLED = !IS_NODE;

let cachedContext: Promise<GPUContext> | null = null;

/** The single cached GPU context (Dawn on Node, `navigator.gpu` in browser). */
export async function getGpuContext(): Promise<GPUContext> {
  if (!cachedContext) {
    cachedContext = (
      IS_NODE ? createNodeGPUContext() : createBrowserGPUContext()
    ).catch((err) => {
      cachedContext = null;
      throw err;
    });
  }
  return cachedContext;
}

/** Premultiply straight-alpha RGBA in place. Mutates and returns `pixels`. */
export function premultiplyInPlace(pixels: Uint8Array): Uint8Array {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] / 255;
    pixels[i] = Math.round(pixels[i] * a);
    pixels[i + 1] = Math.round(pixels[i + 1] * a);
    pixels[i + 2] = Math.round(pixels[i + 2] * a);
  }
  return pixels;
}

/** Un-premultiply RGBA in place. Mutates and returns `pixels`. */
export function unpremultiplyInPlace(pixels: Uint8Array): Uint8Array {
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

/** Read a premultiplied `rgba8unorm` texture back to straight-alpha RGBA bytes. */
export async function readbackTexture(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number
): Promise<Uint8Array> {
  // `copyTextureToBuffer` requires `bytesPerRow` aligned to 256.
  const rowStride = Math.ceil((width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: rowStride * height,
    usage: 0x09 /* COPY_DST | MAP_READ */
  });
  try {
    const encoder = device.createCommandEncoder({ label: "shader-readback" });
    encoder.copyTextureToBuffer(
      { texture },
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

/** Read a `LabeledTexture` back to straight-alpha RGBA bytes. */
export function readbackStraightAlpha(
  device: GPUDevice,
  texture: LabeledTexture
): Promise<Uint8Array> {
  return readbackTexture(device, texture.texture, texture.width, texture.height);
}

// ---------------------------------------------------------------------------
// Run-scoped GPU-texture lifecycle
// ---------------------------------------------------------------------------

const runTextures = new Map<string, Set<LabeledTexture>>();

/**
 * Track `texture` under the run `runId` (a job id) so it's destroyed when the
 * runner ends the run via {@link releaseRunTextures}. Chained shader nodes hand
 * textures to one another within a run; freeing them per-node would break the
 * hand-off, so cleanup is deferred to the run boundary.
 */
export function trackRunTexture(runId: string, texture: LabeledTexture): void {
  let set = runTextures.get(runId);
  if (!set) {
    set = new Set();
    runTextures.set(runId, set);
  }
  set.add(texture);
}

/** Destroy and forget every texture tracked for `runId`. Safe to call twice. */
export function releaseRunTextures(runId: string): void {
  const set = runTextures.get(runId);
  if (!set) return;
  for (const texture of set) {
    try {
      texture.destroy();
    } catch {
      // Texture already destroyed / device lost — nothing to do.
    }
  }
  runTextures.delete(runId);
}

/** Number of live tracked textures (debug/telemetry). */
export function trackedRunTextureCount(): number {
  let total = 0;
  for (const set of runTextures.values()) total += set.size;
  return total;
}

/**
 * Build the in-flight GPU-texture `ImageRef` (browser, single run). `texture`
 * is the `LabeledTexture` the producing shader wrote — held opaque in the ref's
 * `texture` field so a consuming node can sample it directly. It must already
 * be tracked via {@link trackRunTexture}.
 */
export function gpuTextureImageRef(
  texture: LabeledTexture,
  width: number,
  height: number
): ImageRef {
  return { type: "image", texture, mimeType: GPU_TEXTURE_MIME, width, height };
}

/** Read a GPU-texture `ImageRef`'s pixels back to straight-alpha RGBA. */
export async function readbackTextureRef(ref: {
  texture: unknown;
  width: number;
  height: number;
}): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const ctx = await getGpuContext();
  const labeled = ref.texture as LabeledTexture;
  const rgba = await readbackTexture(
    ctx.device,
    labeled.texture,
    ref.width,
    ref.height
  );
  return { rgba, width: ref.width, height: ref.height };
}

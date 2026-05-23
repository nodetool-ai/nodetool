/**
 * `GPUContext` — the host-portability adapter.
 *
 * Holds a TypeGPU `root` (from `tgpu.initFromDevice({ device })`) plus the
 * per-host services the Executor leans on: a pipeline cache, a scratch
 * texture pool, and a capability record. The same `ShaderModule` code runs
 * against a browser `navigator.gpu` device, an Electron device, or a
 * Node.js Dawn device — only the adapter that builds this object differs.
 */

import tgpu from "typegpu";
import type { TgpuRoot } from "typegpu";
import { LabeledTexture, createLabeledTexture } from "./texture.js";
import type { LabeledTextureMeta } from "./texture.js";

/** Host capabilities used by variant resolution (Phase 3) and validation. */
export interface GPUCapabilities {
  /** `texture_external` import supported (camera/video fast path). */
  textureExternal: boolean;
  /** `float16` storage textures supported. */
  f16Storage: boolean;
}

export type CachedPipeline = GPURenderPipeline | GPUComputePipeline;

/** Get-or-compile cache for pipelines, keyed by the caller (module id+variant). */
export interface PipelineCache {
  get(key: string): CachedPipeline | undefined;
  set(key: string, pipeline: CachedPipeline): void;
}

export interface ScratchSpec {
  width: number;
  height: number;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  meta?: Partial<LabeledTextureMeta>;
  label?: string;
}

/**
 * Frame/run-scoped texture pool. `acquire` returns a texture at least as
 * large as requested (bucketed); `release` returns it for reuse. Hosts own
 * lifetime — the pool never reads pixels back to the CPU.
 */
export interface ScratchPool {
  acquire(spec: ScratchSpec): LabeledTexture;
  release(texture: LabeledTexture): void;
  dispose(): void;
}

/**
 * Bounded ring of reusable uniform buffers. The Executor packs each dispatch's
 * params into the next buffer in the ring rather than allocating a fresh
 * `GPUBuffer` per encode — without this, a host dispatching effects every
 * frame (the timeline preview) grows GPU buffer allocations without bound.
 *
 * Reuse is safe because of WebGPU's queue ordering: a `writeBuffer` is ordered
 * after every previously-submitted command on the queue timeline, so reusing a
 * buffer never races a prior submit's read of it. The only constraint is
 * *within a single submit*: two concurrent dispatches must not share a buffer,
 * so the ring size must exceed the number of uniform dispatches a host encodes
 * into one command buffer (the timeline encodes at most a handful).
 */
export interface UniformRing {
  acquire(size: number): GPUBuffer;
  dispose(): void;
}

export interface GPUContext {
  readonly root: TgpuRoot;
  readonly device: GPUDevice;
  readonly capabilities: GPUCapabilities;
  readonly pipelineCache: PipelineCache;
  readonly scratch: ScratchPool;
  readonly uniformRing: UniformRing;
  /**
   * 1×1 white texture used as the default for unbound optional inputs (the
   * canonical case is the `mask` slot — modules sample as if a mask is always
   * present, the executor supplies coverage = 1 when no mask is bound).
   * Lazy-allocated on first use; lifetime is tied to the context (no
   * per-encode allocation).
   */
  getDefaultWhiteTexture(): LabeledTexture;
}

/** Round a dimension up to the allocation bucket (multiple of 64, pow2 ≥ 256). */
export function ceilToBucket(value: number): number {
  const v = Math.max(1, Math.floor(value));
  if (v <= 256) {
    return Math.ceil(v / 64) * 64;
  }
  let pow = 256;
  while (pow < v) {
    pow *= 2;
  }
  return pow;
}

function makePipelineCache(): PipelineCache {
  const cache = new Map<string, CachedPipeline>();
  return {
    get: (key) => cache.get(key),
    set: (key, pipeline) => {
      cache.set(key, pipeline);
    }
  };
}

/** Bucket key per scratch texture, for routing `release` back to its pool. */
const poolKeys = new WeakMap<LabeledTexture, string>();

/**
 * Bucketed, refcounted scratch pool. Buckets on
 * `(format, usage, bucketW, bucketH)`; the caller sees only the requested
 * viewport, the underlying texture may be larger.
 */
export function makeScratchPool(device: GPUDevice): ScratchPool {
  const free = new Map<string, LabeledTexture[]>();
  const live = new Set<LabeledTexture>();

  const bucketKey = (spec: ScratchSpec): string =>
    `${spec.format}:${spec.usage}:${ceilToBucket(spec.width)}x${ceilToBucket(
      spec.height
    )}`;

  return {
    acquire(spec) {
      const key = bucketKey(spec);
      const pooled = free.get(key);
      const reused = pooled?.pop();
      if (reused) {
        live.add(reused);
        return reused;
      }
      const texture = createLabeledTexture(device, {
        width: ceilToBucket(spec.width),
        height: ceilToBucket(spec.height),
        format: spec.format,
        usage: spec.usage,
        label: spec.label ?? `scratch-${key}`,
        meta: spec.meta
      });
      // Stash the bucket key on the instance for release routing.
      poolKeys.set(texture, key);
      live.add(texture);
      return texture;
    },
    release(texture) {
      if (!live.delete(texture)) {
        return;
      }
      const key = poolKeys.get(texture);
      if (!key) {
        texture.destroy();
        return;
      }
      const pooled = free.get(key);
      if (pooled) {
        pooled.push(texture);
      } else {
        free.set(key, [texture]);
      }
    },
    dispose() {
      for (const texture of live) {
        texture.destroy();
      }
      live.clear();
      for (const pooled of free.values()) {
        for (const texture of pooled) {
          texture.destroy();
        }
      }
      free.clear();
    }
  };
}

/** Slots in the uniform ring. Far exceeds the dispatches any host packs into
 * one submit (the timeline tops out at ~6), so no two intra-submit dispatches
 * ever alias the same buffer. */
const UNIFORM_RING_SIZE = 64;

/** Bounded, cycling pool of uniform buffers. See {@link UniformRing}. */
export function makeUniformRing(device: GPUDevice): UniformRing {
  const buffers: (GPUBuffer | undefined)[] = new Array(UNIFORM_RING_SIZE);
  let index = 0;

  return {
    acquire(size) {
      const slot = index;
      index = (index + 1) % UNIFORM_RING_SIZE;
      const wanted = Math.max(16, size);
      let buffer = buffers[slot];
      if (!buffer || buffer.size < wanted) {
        buffer?.destroy();
        buffer = device.createBuffer({
          label: `uniform-ring-${slot}`,
          size: wanted,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        buffers[slot] = buffer;
      }
      return buffer;
    },
    dispose() {
      for (const buffer of buffers) {
        buffer?.destroy();
      }
      buffers.fill(undefined);
    }
  };
}

function detectCapabilities(device: GPUDevice): GPUCapabilities {
  const features = device.features;
  return {
    textureExternal: true,
    f16Storage: features.has("shader-f16")
  };
}

/**
 * Build a {@link GPUContext} from the browser `navigator.gpu`. Browser/WebGPU
 * only — kept out of the package's pure root so Node consumers can import the
 * catalog without touching `navigator`.
 */
export async function createBrowserGPUContext(
  options: { adapterOptions?: GPURequestAdapterOptions } = {}
): Promise<GPUContext> {
  const nav = (globalThis as { navigator?: { gpu?: GPU } }).navigator;
  const gpu = nav?.gpu;
  if (!gpu) {
    throw new Error("WebGPU is not available (navigator.gpu is undefined)");
  }
  const adapter = await gpu.requestAdapter(options.adapterOptions);
  if (!adapter) {
    throw new Error("No WebGPU adapter available");
  }
  const device = await adapter.requestDevice();
  return createGPUContextFromDevice(device);
}

/** Lazy-allocated 1×1 white texture (default for unbound optional inputs). */
function makeWhiteTextureProvider(
  device: GPUDevice
): () => LabeledTexture {
  let cached: LabeledTexture | null = null;
  return () => {
    if (cached) {
      return cached;
    }
    const tex = createLabeledTexture(device, {
      label: "default-white-1x1",
      width: 1,
      height: 1,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });
    device.queue.writeTexture(
      { texture: tex.texture },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1 }
    );
    cached = tex;
    return cached;
  };
}

/**
 * Build a {@link GPUContext} from an already-acquired `GPUDevice` (browser,
 * Electron, or Node.js Dawn). The shared path every adapter funnels into.
 */
export function createGPUContextFromDevice(device: GPUDevice): GPUContext {
  const root = tgpu.initFromDevice({ device });
  return {
    root,
    device,
    capabilities: detectCapabilities(device),
    pipelineCache: makePipelineCache(),
    scratch: makeScratchPool(device),
    uniformRing: makeUniformRing(device),
    getDefaultWhiteTexture: makeWhiteTextureProvider(device)
  };
}

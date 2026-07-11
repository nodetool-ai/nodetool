/**
 * Premultiplied-alpha invariant validator (Item 5 of the shader-pool
 * invariant enforcement plan).
 *
 * When enabled (env flag `NODETOOL_GPU_DEBUG` contains `"premul"`), the
 * Executor calls {@link encodePremulValidationPass} after every dispatch that
 * writes a premultiplied output. The pass runs a small compute shader that
 * scans the output texture and atomically increments counters in a tiny
 * storage buffer whenever a texel violates the premul invariant
 * (`rgb ≤ a`, `rgb ≥ 0`, no NaN).
 *
 * The buffer is then copied into a readback buffer registered on the
 * context's debug sink; the host calls {@link consumePremulDebugWarnings}
 * after submit to map, read, and log violations.
 *
 * Zero overhead when the flag is off: the gate function short-circuits before
 * any allocation. The validator only reads the output texture — it never
 * mutates it — so it cannot perturb pipeline behaviour even when enabled.
 */

import type { GPUContext } from "../context.js";
import { moduleKey, type ShaderModule } from "../module.js";
import type { LabeledTexture } from "../texture.js";

/** One violation report, materialized after readback. */
export interface DebugViolation {
  /** `id@version` of the module whose output was scanned. */
  readonly moduleKey: string;
  /** Total texels scanned. */
  readonly totalChecked: number;
  /** Texels where any RGB channel exceeds alpha by more than epsilon. */
  readonly rgbExceedsA: number;
  /** Texels with any channel < -epsilon. */
  readonly negative: number;
  /** Texels with NaN in any channel. */
  readonly nan: number;
}

/** A queued readback; the executor pushes these onto {@link DebugSink}. */
export interface DebugReadback {
  readonly moduleKey: string;
  readonly buffer: GPUBuffer;
}

/** Mutable list of pending readbacks; lazily attached to {@link GPUContext}. */
export type DebugSink = DebugReadback[];

/** Shape we extend onto {@link GPUContext} at runtime. */
interface DebugContextExtension {
  debugSink?: DebugSink;
  debugValidatorPipeline?: GPUComputePipeline;
}

const COUNTERS_SIZE_BYTES = 16; // 4 × u32: rgbExceedsA, negative, nan, totalChecked

const VALIDATOR_WGSL = /* wgsl */ `
struct Counters {
  rgbExceedsA: atomic<u32>,
  negative: atomic<u32>,
  nan: atomic<u32>,
  totalChecked: atomic<u32>,
};
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> counters: Counters;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(src);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let c = textureLoad(src, vec2i(i32(gid.x), i32(gid.y)), 0);
  atomicAdd(&counters.totalChecked, 1u);
  let eps = 1.0 / 255.0;
  if (c.r != c.r || c.g != c.g || c.b != c.b || c.a != c.a) {
    atomicAdd(&counters.nan, 1u);
    return;
  }
  if (c.r < -eps || c.g < -eps || c.b < -eps || c.a < -eps) {
    atomicAdd(&counters.negative, 1u);
  }
  if (c.r > c.a + eps || c.g > c.a + eps || c.b > c.a + eps) {
    atomicAdd(&counters.rgbExceedsA, 1u);
  }
}
`;

// --- Gating ------------------------------------------------------------------

let cachedFlag: boolean | null = null;

function readEnvFlag(): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.NODETOOL_GPU_DEBUG;
  if (!raw) {
    return false;
  }
  return raw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .includes("premul");
}

/**
 * Whether the premul debug pass should run. Cached on first read for zero
 * overhead in the hot path; {@link setPremulDebugEnabled} exists for tests
 * that need to flip it without re-importing the module.
 */
export function isPremulDebugEnabled(): boolean {
  if (cachedFlag === null) {
    cachedFlag = readEnvFlag();
  }
  return cachedFlag;
}

/** Test hook: forcibly toggle the cached gate (bypassing env). */
export function setPremulDebugEnabled(enabled: boolean): void {
  cachedFlag = enabled;
}

/** Test hook: clear the cache so the next call re-reads the env. */
export function resetPremulDebugCache(): void {
  cachedFlag = null;
}

// --- Pipeline + encoding -----------------------------------------------------

const pipelineByDevice = new WeakMap<GPUDevice, GPUComputePipeline>();
const bindGroupLayoutByDevice = new WeakMap<GPUDevice, GPUBindGroupLayout>();

function getValidatorPipeline(device: GPUDevice): {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
} {
  let pipeline = pipelineByDevice.get(device);
  let bindGroupLayout = bindGroupLayoutByDevice.get(device);
  if (pipeline && bindGroupLayout) {
    return { pipeline, bindGroupLayout };
  }
  bindGroupLayout = device.createBindGroupLayout({
    label: "premul-validator-bgl",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float", viewDimension: "2d" }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" }
      }
    ]
  });
  const shaderModule = device.createShaderModule({
    label: "premul-validator-shader",
    code: VALIDATOR_WGSL
  });
  pipeline = device.createComputePipeline({
    label: "premul-validator-pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module: shaderModule, entryPoint: "main" }
  });
  pipelineByDevice.set(device, pipeline);
  bindGroupLayoutByDevice.set(device, bindGroupLayout);
  return { pipeline, bindGroupLayout };
}

export interface EncodeValidationArgs {
  ctx: GPUContext;
  module: ShaderModule;
  encoder: GPUCommandEncoder;
  output: LabeledTexture;
}

/**
 * Encode a debug validation pass into the given encoder, then schedule a
 * buffer-to-buffer copy into a fresh readback buffer registered on
 * `ctx.debugSink`. Caller is responsible for `consumePremulDebugWarnings`
 * after submit to actually map the readback.
 *
 * Silently skips if the output texture lacks `TEXTURE_BINDING` usage: the
 * pass needs to sample the output and we will not silently re-allocate
 * with extra usage flags. The host should add `TEXTURE_BINDING` to outputs
 * it wants validated.
 */
export function encodePremulValidationPass(args: EncodeValidationArgs): void {
  const { ctx, module, encoder, output } = args;
  if ((output.texture.usage & GPUTextureUsage.TEXTURE_BINDING) === 0) {
    return;
  }
  const { device } = ctx;
  const { pipeline, bindGroupLayout } = getValidatorPipeline(device);

  const counters = device.createBuffer({
    label: "premul-validator-counters",
    size: COUNTERS_SIZE_BYTES,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST
  });
  // Zero the counters before the pass.
  device.queue.writeBuffer(counters, 0, new Uint32Array([0, 0, 0, 0]));

  const readback = device.createBuffer({
    label: "premul-validator-readback",
    size: COUNTERS_SIZE_BYTES,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  const bindGroup = device.createBindGroup({
    label: "premul-validator-bindgroup",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: output.createView() },
      { binding: 1, resource: { buffer: counters } }
    ]
  });

  const pass = encoder.beginComputePass({ label: "premul-validator-pass" });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const wgX = Math.ceil(output.width / 8);
  const wgY = Math.ceil(output.height / 8);
  pass.dispatchWorkgroups(Math.max(1, wgX), Math.max(1, wgY), 1);
  pass.end();

  encoder.copyBufferToBuffer(counters, 0, readback, 0, COUNTERS_SIZE_BYTES);

  const ext = ctx as GPUContext & DebugContextExtension;
  if (!ext.debugSink) {
    ext.debugSink = [];
  }
  ext.debugSink.push({
    moduleKey: moduleKey(module.id, module.version),
    buffer: readback
  });
  // counters is only needed while the encoder runs; stash it on the readback
  // entry so the consumer can destroy it once the readback completes.
  (ext.debugSink[ext.debugSink.length - 1] as DebugReadback & {
    countersBuffer?: GPUBuffer;
  }).countersBuffer = counters;
}

// --- Readback / reporting ----------------------------------------------------

/**
 * Map every queued debug readback, decode the four-counter struct, log a
 * warning per non-zero entry, and return the violations. Buffers are
 * destroyed after read so a long-running host doesn't leak.
 *
 * Safe to call when no validation passes were encoded — returns `[]`.
 */
export async function consumePremulDebugWarnings(
  ctx: GPUContext
): Promise<DebugViolation[]> {
  const ext = ctx as GPUContext & DebugContextExtension;
  const sink = ext.debugSink;
  if (!sink || sink.length === 0) {
    return [];
  }
  // Detach so concurrent encoders can begin a fresh batch.
  ext.debugSink = [];
  const violations: DebugViolation[] = [];
  for (const entry of sink) {
    await entry.buffer.mapAsync(GPUMapMode.READ);
    const view = new Uint32Array(entry.buffer.getMappedRange().slice(0));
    entry.buffer.unmap();
    entry.buffer.destroy();
    const sibling = entry as DebugReadback & { countersBuffer?: GPUBuffer };
    sibling.countersBuffer?.destroy();
    const violation: DebugViolation = {
      moduleKey: entry.moduleKey,
      rgbExceedsA: view[0] ?? 0,
      negative: view[1] ?? 0,
      nan: view[2] ?? 0,
      totalChecked: view[3] ?? 0
    };
    if (
      violation.rgbExceedsA > 0 ||
      violation.negative > 0 ||
      violation.nan > 0
    ) {
      // `console` is not in this package's tsconfig `lib`, but every host
      // (browser, Electron, Node) has it on globalThis. Routed through a
      // typed alias so DOM lib isn't required.
      const con = (globalThis as { console?: { warn(...args: unknown[]): void } })
        .console;
      con?.warn(
        `[gpu/premul-debug] ${violation.moduleKey}: ` +
          `rgbExceedsA=${violation.rgbExceedsA} ` +
          `negative=${violation.negative} ` +
          `nan=${violation.nan} ` +
          `(of ${violation.totalChecked} texels)`
      );
    }
    violations.push(violation);
  }
  return violations;
}

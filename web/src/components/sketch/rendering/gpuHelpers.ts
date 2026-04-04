/**
 * gpuHelpers — Small internal WebGPU utility functions.
 *
 * Reduces boilerplate in WebGPURuntime without hiding pass boundaries or
 * resource ownership. These are deliberately minimal helpers, not an
 * abstraction layer.
 *
 * Phase 3D: First internal runtime wrappers. Additional helpers (e.g.
 * texture pool, readback manager) should be added here as the runtime
 * grows, rather than spreading boilerplate across WebGPURuntime.
 */

// ─── Fullscreen pass helper ──────────────────────────────────────────────────

/**
 * Descriptor for a fullscreen triangle-strip pass.
 *
 * Each pass consists of:
 * - A shader module (vertex + fragment combined)
 * - A bind group layout (uniforms, textures)
 * - A render pipeline (using the shader + layout)
 *
 * This is the repeating pattern in `WebGPURuntime.initPipelines()`.
 */
export interface FullscreenPassDescriptor {
  /** Debug label prefix (e.g. "checkerboard", "blend"). */
  label: string;
  /** Combined WGSL source (vertex + fragment). */
  shaderCode: string;
  /** Fragment shader entry point name. */
  fragmentEntryPoint: string;
  /** Vertex shader entry point name (default: "vs_main"). */
  vertexEntryPoint?: string;
  /**
   * Bind group layout entries.
   * Convenience: only `binding` and the resource type need to be specified;
   * `visibility` defaults to `GPUShaderStage.FRAGMENT`.
   */
  bindings: FullscreenPassBinding[];
  /** Swap chain / target format. */
  format: GPUTextureFormat;
  /** Optional hardware blend state for the color target. */
  blend?: GPUBlendState;
}

export type FullscreenPassBinding =
  | { binding: number; type: "uniform"; visibility?: GPUFlagsConstant }
  | { binding: number; type: "texture"; sampleType?: GPUTextureSampleType; visibility?: GPUFlagsConstant };

export interface FullscreenPassResult {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

/**
 * Create a fullscreen triangle-strip render pipeline from a descriptor.
 *
 * This eliminates the repeated boilerplate of:
 * 1. `device.createShaderModule(…)`
 * 2. `device.createBindGroupLayout(…)`
 * 3. `device.createRenderPipeline(…)` with `primitive: triangle-strip`
 *
 * It does **not** hide pass execution, bind group creation, or resource
 * ownership — callers still control those explicitly.
 */
export function createFullscreenPass(
  device: GPUDevice,
  desc: FullscreenPassDescriptor
): FullscreenPassResult {
  const module = device.createShaderModule({
    label: `${desc.label}-shader`,
    code: desc.shaderCode
  });

  const entries: GPUBindGroupLayoutEntry[] = desc.bindings.map((b) => {
    const visibility = b.visibility ?? GPUShaderStage.FRAGMENT;
    if (b.type === "uniform") {
      return { binding: b.binding, visibility, buffer: { type: "uniform" as const } };
    }
    return {
      binding: b.binding,
      visibility,
      texture: { sampleType: (b.sampleType ?? "float") as GPUTextureSampleType }
    };
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: `${desc.label}-bgl`,
    entries
  });

  const pipeline = device.createRenderPipeline({
    label: `${desc.label}-pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    }),
    vertex: {
      module,
      entryPoint: desc.vertexEntryPoint ?? "vs_main"
    },
    fragment: {
      module,
      entryPoint: desc.fragmentEntryPoint,
      targets: [
        desc.blend
          ? { format: desc.format, blend: desc.blend }
          : { format: desc.format }
      ]
    },
    primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
  });

  return { pipeline, bindGroupLayout };
}

// ─── Uniform buffer helper ───────────────────────────────────────────────────

/**
 * Create a GPU buffer pre-filled with the given data.
 *
 * This is a thin wrapper over `device.createBuffer` + `writeBuffer` that
 * removes the repeated `mappedAtCreation` / `new Float32Array(…)` pattern.
 */
export function createUniformBuffer(
  device: GPUDevice,
  data: Float32Array | Uint32Array,
  label?: string
): GPUBuffer {
  const buffer = device.createBuffer({
    label: label ?? "uniform",
    size: Math.max(data.byteLength, 16), // WebGPU minimum buffer size
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
  return buffer;
}

// ─── Texture creation helper ─────────────────────────────────────────────────

/**
 * Create a 2D render-target texture (used for ping-pong compositing, FX temp, etc.).
 */
export function createRenderTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  label?: string
): GPUTexture {
  return device.createTexture({
    label: label ?? "render-target",
    size: { width, height },
    format,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC
  });
}

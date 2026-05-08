import { compositeShader } from "./shaders";
import type {
  CompositeLayer,
  CompositeSource,
  CompositorBlendMode,
  CompositorInitResult
} from "./types";

const UNIFORM_BUFFER_SIZE = 16; // 4 x f32 (scaleX, scaleY, opacity, pad)

const BLEND_MODES: CompositorBlendMode[] = [
  "normal",
  "add",
  "multiply",
  "screen",
  "overlay"
];

/**
 * Maps each TimelineClip blend mode to a WebGPU fixed-function blend state.
 * `overlay` has no fixed-function equivalent — fall back to normal alpha.
 */
function blendStateFor(mode: CompositorBlendMode): GPUBlendState {
  switch (mode) {
    case "add":
      return {
        color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
      };
    case "multiply":
      return {
        color: { srcFactor: "dst", dstFactor: "zero", operation: "add" },
        alpha: {
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        }
      };
    case "screen":
      return {
        color: {
          srcFactor: "one",
          dstFactor: "one-minus-src",
          operation: "add"
        },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
      };
    case "normal":
    case "overlay":
    default:
      return {
        color: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        },
        alpha: {
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        }
      };
  }
}

interface LayerTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  source: CompositeSource;
  /** Last frame number we copied for this source. Re-used to skip needless uploads. */
  lastUploadKey: string;
}

/**
 * Returns a key that changes when the source has produced a new pixel state.
 * For video this uses the underlying mediaTime when available; for images,
 * src + naturalWidth+Height suffices.
 */
function uploadKey(source: CompositeSource): string {
  if (source instanceof HTMLVideoElement) {
    // currentTime alone is enough to discriminate frames during playback.
    return `v:${source.currentTime}:${source.videoWidth}x${source.videoHeight}`;
  }
  if (source instanceof HTMLImageElement) {
    return `i:${source.src}:${source.naturalWidth}x${source.naturalHeight}`;
  }
  return `b:${source.width}x${source.height}`;
}

function sourceDimensions(source: CompositeSource): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || 0,
      height: source.videoHeight || 0
    };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || 0,
      height: source.naturalHeight || 0
    };
  }
  return { width: source.width, height: source.height };
}

export class WebGPUCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = "rgba8unorm";

  private uniformLayout: GPUBindGroupLayout | null = null;
  private textureLayout: GPUBindGroupLayout | null = null;
  private sampler: GPUSampler | null = null;
  private pipelines = new Map<CompositorBlendMode, GPURenderPipeline>();

  private canvasWidth = 0;
  private canvasHeight = 0;

  private layerTextures = new Map<string, LayerTexture>();
  private uniformBuffers: GPUBuffer[] = [];
  private layers: CompositeLayer[] = [];

  async init(canvas: HTMLCanvasElement): Promise<CompositorInitResult> {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      return { ok: false, reason: "WebGPU not supported in this browser" };
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance"
    });
    if (!adapter) {
      return { ok: false, reason: "No WebGPU adapter available" };
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      return { ok: false, reason: "Failed to get WebGPU canvas context" };
    }

    this.device = device;
    this.context = context;
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;

    context.configure({
      device,
      format: this.canvasFormat,
      alphaMode: "premultiplied"
    });

    this.uniformLayout = device.createBindGroupLayout({
      label: "preview-uniform-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }
      ]
    });
    this.textureLayout = device.createBindGroupLayout({
      label: "preview-texture-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });

    this.sampler = device.createSampler({
      label: "preview-sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    const shaderModule = device.createShaderModule({
      label: "preview-composite",
      code: compositeShader
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.uniformLayout, this.textureLayout]
    });

    for (const mode of BLEND_MODES) {
      const pipeline = device.createRenderPipeline({
        label: `preview-pipeline-${mode}`,
        layout: pipelineLayout,
        vertex: { module: shaderModule, entryPoint: "vs" },
        fragment: {
          module: shaderModule,
          entryPoint: "fs",
          targets: [{ format: this.canvasFormat, blend: blendStateFor(mode) }]
        },
        primitive: { topology: "triangle-list" }
      });
      this.pipelines.set(mode, pipeline);
    }

    return { ok: true };
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  setLayers(layers: CompositeLayer[]): void {
    this.layers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    this.pruneStaleTextures();
  }

  private pruneStaleTextures(): void {
    const liveIds = new Set(this.layers.map((l) => l.id));
    for (const [id, entry] of this.layerTextures) {
      if (!liveIds.has(id)) {
        entry.texture.destroy();
        this.layerTextures.delete(id);
      }
    }
  }

  /**
   * Allocates / reuses a GPU texture for the layer's source and copies the
   * current source pixels into it. Returns null if the source isn't ready
   * yet (e.g. video has no decoded frame).
   */
  private uploadLayer(layer: CompositeLayer): LayerTexture | null {
    if (!this.device) return null;

    const { width, height } = sourceDimensions(layer.source);
    if (width === 0 || height === 0) return null;

    const key = uploadKey(layer.source);
    let entry = this.layerTextures.get(layer.id);

    if (
      !entry ||
      entry.width !== width ||
      entry.height !== height ||
      entry.source !== layer.source
    ) {
      entry?.texture.destroy();
      const texture = this.device.createTexture({
        label: `preview-layer-${layer.id}`,
        size: { width, height },
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = { texture, width, height, source: layer.source, lastUploadKey: "" };
      this.layerTextures.set(layer.id, entry);
    }

    if (entry.lastUploadKey !== key) {
      this.device.queue.copyExternalImageToTexture(
        { source: layer.source, flipY: false },
        { texture: entry.texture, premultipliedAlpha: false },
        { width, height }
      );
      entry.lastUploadKey = key;
    }
    return entry;
  }

  private getUniformBuffer(index: number): GPUBuffer {
    if (!this.device) {
      throw new Error("Compositor not initialized");
    }
    let buffer = this.uniformBuffers[index];
    if (!buffer) {
      buffer = this.device.createBuffer({
        label: `preview-uniforms-${index}`,
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.uniformBuffers[index] = buffer;
    }
    return buffer;
  }

  /** Compute object-fit:contain scale factors in clip space. */
  private containScale(
    layerWidth: number,
    layerHeight: number
  ): { scaleX: number; scaleY: number } {
    if (
      this.canvasWidth === 0 ||
      this.canvasHeight === 0 ||
      layerWidth === 0 ||
      layerHeight === 0
    ) {
      return { scaleX: 1, scaleY: 1 };
    }
    const canvasAspect = this.canvasWidth / this.canvasHeight;
    const layerAspect = layerWidth / layerHeight;
    if (layerAspect > canvasAspect) {
      return { scaleX: 1, scaleY: canvasAspect / layerAspect };
    }
    return { scaleX: layerAspect / canvasAspect, scaleY: 1 };
  }

  render(): void {
    if (
      !this.device ||
      !this.context ||
      !this.sampler ||
      !this.uniformLayout ||
      !this.textureLayout
    ) {
      return;
    }

    const view = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder({ label: "preview-frame" });
    const pass = encoder.beginRenderPass({
      label: "preview-pass",
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    let drawn = 0;
    for (const layer of this.layers) {
      const entry = this.uploadLayer(layer);
      if (!entry) continue;

      const { scaleX, scaleY } = this.containScale(entry.width, entry.height);
      const uniformBuffer = this.getUniformBuffer(drawn);
      const data = new Float32Array([scaleX, scaleY, layer.opacity, 0]);
      this.device.queue.writeBuffer(uniformBuffer, 0, data.buffer, 0, data.byteLength);

      const uniformBindGroup = this.device.createBindGroup({
        layout: this.uniformLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
      });
      const textureBindGroup = this.device.createBindGroup({
        layout: this.textureLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: entry.texture.createView() }
        ]
      });

      const pipeline =
        this.pipelines.get(layer.blendMode) ?? this.pipelines.get("normal");
      if (!pipeline) continue;

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, uniformBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.draw(6);
      drawn++;
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    for (const entry of this.layerTextures.values()) {
      entry.texture.destroy();
    }
    this.layerTextures.clear();
    for (const buffer of this.uniformBuffers) {
      buffer.destroy();
    }
    this.uniformBuffers = [];
    this.pipelines.clear();
    this.sampler = null;
    this.uniformLayout = null;
    this.textureLayout = null;
    this.context = null;
    this.device?.destroy();
    this.device = null;
  }
}

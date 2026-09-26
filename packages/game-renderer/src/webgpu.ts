import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { colorBrightnessContrastV1, createExecutor, createGPUContextFromDevice, createLabeledTexture, type LabeledTexture } from "@nodetool-ai/gpu/pool";
import { AssetCache, imageHeight, imageWidth, type GameImage } from "./canvas2d.js";
import { parseTint, visibleItems } from "./frame.js";
import type { GameRenderer, GameRendererCapabilities, GameRendererEffect, GameRendererStats } from "./index.js";

const INSTANCE_FLOATS = 14;
const SHADER = `
struct Camera { center: vec2f, viewport: vec2f, zoom: f32, padding0: f32, padding1: f32, padding2: f32 };
override linearizeInput: bool = false;
fn srgbToLinear(rgb: vec3f) -> vec3f {
  return select(rgb / 12.92, pow((rgb + 0.055) / 1.055, vec3f(2.4)), rgb > vec3f(0.04045));
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;

struct VertexInput {
  @builtin(vertex_index) corner: u32,
  @location(0) center: vec2f,
  @location(1) size: vec2f,
  @location(2) uv: vec4f,
  @location(3) color: vec4f,
  @location(4) rotation: f32,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
};
@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-0.5, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, 0.5),
    vec2f(0.5, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
  let local = corners[input.corner] * input.size;
  let sine = sin(input.rotation);
  let cosine = cos(input.rotation);
  let rotated = vec2f(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
  let world = input.center + rotated;
  let clip = (world - camera.center) * camera.zoom * 2.0 / camera.viewport;
  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  let uvCorner = corners[input.corner] + vec2f(0.5, 0.5);
  output.uv = input.uv.xy + vec2f(uvCorner.x, 1.0 - uvCorner.y) * input.uv.zw;
  output.color = input.color;
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let sampled = textureSample(atlas, atlasSampler, input.uv) * input.color;
  let straight = select(sampled.rgb, srgbToLinear(sampled.rgb), linearizeInput);
  return vec4f(straight * sampled.a, sampled.a);
}`;

const PRESENT_SHADER = `
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  output.uv = positions[index] * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let premul = textureSample(sourceTexture, sourceSampler, input.uv);
  let straight = premul.rgb / max(premul.a, 1.0 / 255.0);
  let encoded = select(straight * 12.92, 1.055 * pow(straight, vec3f(1.0 / 2.4)) - 0.055,
    straight > vec3f(0.0031308));
  return vec4f(clamp(encoded, vec3f(0.0), vec3f(1.0)) * premul.a, premul.a);
}`;

interface TextureEntry {
  readonly texture: GPUTexture;
  readonly bindGroup: GPUBindGroup;
  readonly width: number;
  readonly height: number;
}

interface Batch {
  readonly texture: TextureEntry;
  readonly first: number;
  count: number;
}

/** Draws ordered sprites as consecutive texture batches on a private WebGPU device. */
export class WebGPUGameRenderer implements GameRenderer {
  readonly backend = "webgpu";
  private readonly pipeline: GPURenderPipeline;
  private readonly effectSpritePipeline: GPURenderPipeline;
  private readonly presentPipeline: GPURenderPipeline;
  private readonly presentLayout: GPUBindGroupLayout;
  private readonly effectContext;
  private readonly effectExecutor = createExecutor();
  private effect: GameRendererEffect | null = null;
  private sourceTarget: LabeledTexture | undefined;
  private effectTarget: LabeledTexture | undefined;
  private minimalRenderSucceeded = false;
  private readonly sampler: GPUSampler;
  private readonly cameraBuffer: GPUBuffer;
  private readonly textures = new Map<string, TextureEntry>();
  private readonly fallback: TextureEntry;
  private readonly placeholders = new Map<string, TextureEntry>();
  private instanceBuffer: GPUBuffer | undefined;
  private instanceCapacity = 0;
  private hudCanvas: HTMLCanvasElement | undefined;
  private hudTexture: TextureEntry | undefined;
  private hudKey = "";
  private disposed = false;
  private lost = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly format: GPUTextureFormat,
    private readonly assets: AssetCache,
    private readonly adapterType: "hardware" | "software" | "unknown" = "unknown",
  ) {
    const module = device.createShaderModule({ code: SHADER });
    const spriteLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [spriteLayout] });
    const pipelineDescriptor = (targetFormat: GPUTextureFormat, linearizeInput: boolean): GPURenderPipelineDescriptor => ({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: "vertexMain",
        buffers: [{
          arrayStride: INSTANCE_FLOATS * 4,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32x4" },
            { shaderLocation: 3, offset: 32, format: "float32x4" },
            { shaderLocation: 4, offset: 48, format: "float32" },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        constants: { linearizeInput: linearizeInput ? 1 : 0 },
        targets: [{
          format: targetFormat,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.pipeline = device.createRenderPipeline(pipelineDescriptor(format, false));
    this.effectSpritePipeline = device.createRenderPipeline(pipelineDescriptor("rgba8unorm", true));
    this.presentLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ] });
    const presentModule = device.createShaderModule({ code: PRESENT_SHADER });
    this.presentPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.presentLayout] }),
      vertex: { module: presentModule, entryPoint: "vertexMain" },
      fragment: { module: presentModule, entryPoint: "fragmentMain", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.effectContext = createGPUContextFromDevice(device);
    this.sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest", mipmapFilter: "nearest" });
    this.cameraBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const fallbackTexture = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: fallbackTexture }, new Uint8Array([255, 0, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.fallback = this.textureEntry(fallbackTexture, 1, 1);
    void device.lost.then(() => { this.lost = true; });
  }

  get capabilities(): GameRendererCapabilities {
    return { backend: this.backend, core2D: true, gpuEffects: !this.lost && !this.disposed,
      adapterType: this.adapterType, deviceStatus: this.disposed ? "disposed" : this.lost ? "lost" : "ready",
      enabledFeatures: [...this.device.features], requestedFeatures: [],
      limits: { maxTextureDimension2D: this.device.limits.maxTextureDimension2D,
        maxBufferSize: this.device.limits.maxBufferSize },
      minimalRenderSucceeded: this.minimalRenderSucceeded, deviceLossCount: this.lost ? 1 : 0,
      fallbackReason: null };
  }

  setEffect(effect: GameRendererEffect | null): void {
    if (effect && (!Number.isFinite(effect.brightness) || effect.brightness < -1 || effect.brightness > 1 ||
      !Number.isFinite(effect.contrast) || effect.contrast < 0 || effect.contrast > 4)) {
      throw new Error("Brightness and contrast are outside the approved range");
    }
    this.effect = effect;
    if (!effect) {
      this.sourceTarget?.destroy();
      this.effectTarget?.destroy();
      this.sourceTarget = undefined;
      this.effectTarget = undefined;
    }
  }

  private ensureEffectTargets(): void {
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    if (this.sourceTarget?.width === width && this.sourceTarget.height === height) {
      return;
    }
    this.sourceTarget?.destroy();
    this.effectTarget?.destroy();
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.sourceTarget = createLabeledTexture(this.device, { width, height, format: "rgba8unorm", usage,
      label: "game-effect-source" });
    this.effectTarget = createLabeledTexture(this.device, { width, height, format: "rgba8unorm", usage,
      label: "game-effect-output" });
  }

  private textureEntry(texture: GPUTexture, width: number, height: number): TextureEntry {
    return {
      texture,
      width,
      height,
      bindGroup: this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: texture.createView() },
        ],
      }),
    };
  }

  private upload(image: GameImage | HTMLCanvasElement): TextureEntry {
    const width = image instanceof HTMLCanvasElement ? image.width : imageWidth(image);
    const height = image instanceof HTMLCanvasElement ? image.height : imageHeight(image);
    if (width <= 0 || height <= 0) {
      return this.fallback;
    }
    const texture = this.device.createTexture({ size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture, premultipliedAlpha: false }, [width, height]);
    return this.textureEntry(texture, width, height);
  }

  private async getTexture(assetId: string): Promise<{ texture: TextureEntry; uploadedBytes: number }> {
    const cached = this.textures.get(assetId);
    if (cached) {
      return { texture: cached, uploadedBytes: 0 };
    }
    const image = await this.assets.get(assetId);
    if (!image) {
      return { texture: this.placeholder(assetId), uploadedBytes: 0 };
    }
    const texture = this.upload(image);
    this.textures.set(assetId, texture);
    return { texture, uploadedBytes: texture.width * texture.height * 4 };
  }

  private placeholder(assetId: string): TextureEntry {
    const cached = this.placeholders.get(assetId);
    if (cached) {
      return cached;
    }
    const colors = {
      player: [42, 202, 233, 255], wall: [92, 105, 120, 255], gem: [255, 196, 50, 255],
    } as const;
    const color = assetId === "player" ? colors.player : assetId === "wall" ? colors.wall : assetId === "gem" ? colors.gem : undefined;
    if (!color) {
      return this.fallback;
    }
    const texture = this.device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture }, new Uint8Array(color), { bytesPerRow: 4 }, [1, 1]);
    const entry = this.textureEntry(texture, 1, 1);
    this.placeholders.set(assetId, entry);
    return entry;
  }

  async render(frame: GameRenderFrame, interpolation: number): Promise<GameRendererStats> {
    if (this.disposed || this.lost) {
      throw new Error(this.lost ? "WebGPU device was lost" : "Game renderer is disposed");
    }
    const items = visibleItems(frame, interpolation);
    const assetIds = [...new Set(items.map((item) => item.assetId))];
    const textureResults = await Promise.all(assetIds.map((assetId) => this.getTexture(assetId)));
    const textureById = new Map(assetIds.map((assetId, index) => [assetId, textureResults[index]]));
    const hudTexture = this.updateHud(frame);
    const count = items.length + (hudTexture ? 1 : 0);
    this.ensureInstanceCapacity(count);
    const instances = new Float32Array(count * INSTANCE_FLOATS);
    const batches: Batch[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const result = item ? textureById.get(item.assetId) : undefined;
      if (!item || !result) {
        continue;
      }
      const texture = result.texture;
      const rect = texture.width === 1 && texture.height === 1 ? { x: 0, y: 0, width: 1, height: 1 } : item.frame ?? { x: 0, y: 0, width: texture.width, height: texture.height };
      const tint = parseTint(item.tint);
      this.writeInstance(instances, index, item.x, item.y, item.width, item.height,
        rect.x / texture.width, rect.y / texture.height, rect.width / texture.width, rect.height / texture.height,
        tint[0], tint[1], tint[2], item.opacity, item.rotation);
      this.appendBatch(batches, texture, index);
    }
    if (hudTexture) {
      const scale = frame.camera.zoom;
      this.writeInstance(instances, items.length, frame.camera.x, frame.camera.y,
        frame.width / scale, frame.height / scale, 0, 0, 1, 1, 1, 1, 1, 1, 0);
      this.appendBatch(batches, hudTexture, items.length);
    }
    const camera = new Float32Array([frame.camera.x, frame.camera.y, frame.width, frame.height, frame.camera.zoom, 0, 0, 0]);
    this.device.queue.writeBuffer(this.cameraBuffer, 0, camera);
    if (count > 0 && this.instanceBuffer) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, instances);
    }
    const encoder = this.device.createCommandEncoder();
    if (this.effect) {
      this.ensureEffectTargets();
    }
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.effect ? this.sourceTarget!.createView() : this.context.getCurrentTexture().createView(),
      loadOp: "clear",
      storeOp: "store",
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    }] });
    pass.setPipeline(this.effect ? this.effectSpritePipeline : this.pipeline);
    if (this.instanceBuffer) {
      pass.setVertexBuffer(0, this.instanceBuffer);
      for (const batch of batches) {
        pass.setBindGroup(0, batch.texture.bindGroup);
        pass.draw(6, batch.count, 0, batch.first);
      }
    }
    pass.end();
    if (this.effect) {
      const source = this.sourceTarget!;
      const output = this.effectTarget!;
      source.markWritten();
      this.effectContext.uniformRing.beginSubmission();
      this.effectExecutor.encode({ ctx: this.effectContext, module: colorBrightnessContrastV1,
        encoder, inputs: { source }, output,
        params: { brightness: this.effect.brightness, contrast: this.effect.contrast },
        dispatch: { kind: "fragment" } });
      const presentGroup = this.device.createBindGroup({ layout: this.presentLayout, entries: [
        { binding: 0, resource: this.sampler }, { binding: 1, resource: output.createView() },
      ] });
      const presentPass = encoder.beginRenderPass({ colorAttachments: [{
        view: this.context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }] });
      presentPass.setPipeline(this.presentPipeline);
      presentPass.setBindGroup(0, presentGroup);
      presentPass.draw(3);
      presentPass.end();
    }
    this.device.queue.submit([encoder.finish()]);
    this.minimalRenderSucceeded = true;
    const textureBytes = [...this.textures.values(), ...this.placeholders.values(), this.fallback,
      ...(this.hudTexture ? [this.hudTexture] : [])].reduce((sum, entry) => sum + entry.width * entry.height * 4, 0);
    return {
      backend: this.backend,
      visibleSprites: items.length,
      drawCalls: batches.length + (this.effect ? 2 : 0),
      uploadedBytes: textureResults.reduce((sum, result) => sum + result.uploadedBytes, 0),
      textureBytes,
      targetBytes: this.sourceTarget && this.effectTarget ? (this.sourceTarget.width * this.sourceTarget.height +
        this.effectTarget.width * this.effectTarget.height) * 4 : 0,
      instanceBufferBytes: this.instanceCapacity * INSTANCE_FLOATS * 4,
    };
  }

  private updateHud(frame: GameRenderFrame): TextureEntry | undefined {
    if (frame.hud.length === 0) {
      return undefined;
    }
    const key = JSON.stringify([this.canvas.width, this.canvas.height, frame.hud]);
    if (key !== this.hudKey) {
      const canvas = this.hudCanvas ?? document.createElement("canvas");
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("HUD canvas is unavailable");
      }
      context.fillStyle = "#ffffff";
      context.font = "16px sans-serif";
      context.textBaseline = "top";
      for (const label of frame.hud) {
        context.fillText(label.text, label.x, label.y);
      }
      this.hudTexture?.texture.destroy();
      this.hudTexture = this.upload(canvas);
      this.hudCanvas = canvas;
      this.hudKey = key;
    }
    return this.hudTexture;
  }

  private appendBatch(batches: Batch[], texture: TextureEntry, index: number): void {
    const last = batches[batches.length - 1];
    if (last?.texture === texture) {
      last.count++;
    } else {
      batches.push({ texture, first: index, count: 1 });
    }
  }

  private writeInstance(target: Float32Array, index: number, ...values: number[]): void {
    target.set(values, index * INSTANCE_FLOATS);
  }

  private ensureInstanceCapacity(count: number): void {
    if (count <= this.instanceCapacity) {
      return;
    }
    this.instanceBuffer?.destroy();
    this.instanceCapacity = Math.max(count, this.instanceCapacity * 2, 64);
    this.instanceBuffer = this.device.createBuffer({ size: this.instanceCapacity * INSTANCE_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  resize(width: number, height: number): void {
    this.canvas.width = Math.max(1, Math.floor(width));
    this.canvas.height = Math.max(1, Math.floor(height));
    this.context.configure({ device: this.device, format: this.format, alphaMode: "premultiplied" });
    this.sourceTarget?.destroy();
    this.effectTarget?.destroy();
    this.sourceTarget = undefined;
    this.effectTarget = undefined;
  }

  invalidateAsset(assetId: string): void {
    this.assets.invalidate(assetId);
    const texture = this.textures.get(assetId);
    texture?.texture.destroy();
    this.textures.delete(assetId);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.instanceBuffer?.destroy();
    this.sourceTarget?.destroy();
    this.effectTarget?.destroy();
    this.effectContext.scratch.dispose();
    this.effectContext.uniformRing.dispose();
    this.effectContext.root.destroy();
    this.cameraBuffer.destroy();
    this.fallback.texture.destroy();
    this.hudTexture?.texture.destroy();
    for (const entry of this.placeholders.values()) {
      entry.texture.destroy();
    }
    this.placeholders.clear();
    for (const entry of this.textures.values()) {
      entry.texture.destroy();
    }
    this.textures.clear();
    this.assets.clear();
    this.context.unconfigure();
    this.device.destroy();
  }
}

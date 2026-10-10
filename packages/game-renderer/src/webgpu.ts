import { INSTANCE_FLOATS, SHADER, appendBatch, writeInstance } from "./webgpu/sprites.js";
import { LIGHT_SHADER, gameLightingUniforms } from "./webgpu/lighting.js";
import { PRESENT_SHADER, encodeGameEffects } from "./webgpu/effects.js";
import { HUD_SHADER, paintWebGPUHud } from "./webgpu/hud.js";
import { loadGameUiImages } from "./ui/hud2d.js";
import type { TextureEntry, Batch, Blend } from "./webgpu/types.js";
import { WebGPURenderPipeline } from "./webgpu/pipeline.js";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { createDefaultRegistry, createExecutor, createGPUContextFromDevice, createLabeledTexture, createRecipeRunner, LabeledTexture } from "@nodetool-ai/gpu/pool";
import { AssetCache, imageHeight, imageWidth, type GameImage } from "./canvas2d.js";
import { parseTint, projectedCamera, sourceRect, visibleItems } from "./frame.js";
import { PARTICLE_DOT_ASSET, PARTICLE_DOT_SIZE, particleDotPixels, type GameParticleField } from "./particles/render2d.js";
import type { GameHudEffectOrder, GameRenderer, GameRendererCapabilities, GameRendererEffect, GameRendererStats } from "./index.js";

/** Draws ordered sprites as consecutive texture batches on a private WebGPU device. */
export class WebGPUGameRenderer implements GameRenderer {
  private readonly renderPipeline = new WebGPURenderPipeline();
  readonly backend = "webgpu";
  private readonly pipeline: GPURenderPipeline;
  private readonly effectSpritePipeline: GPURenderPipeline;
  private readonly additivePipeline: GPURenderPipeline;
  private readonly effectAdditivePipeline: GPURenderPipeline;
  private readonly linearSampler: GPUSampler;
  private presentPipeline: GPURenderPipeline;
  private readonly presentModule: GPUShaderModule;
  private readonly hudPipeline: GPURenderPipeline;
  private readonly toSrgbPipeline: GPURenderPipeline;
  private readonly toLinearPipeline: GPURenderPipeline;
  private readonly presentLayout: GPUBindGroupLayout;
  private readonly effectContext;
  private readonly effectExecutor = createExecutor();
  private readonly effectRecipeRunner = createRecipeRunner();
  private readonly effectRegistry = createDefaultRegistry();
  private effects: readonly GameRendererEffect[] = [];
  private hudOrder: GameHudEffectOrder = "beforeEffects";
  private sourceTarget: LabeledTexture | undefined;
  private effectTarget: LabeledTexture | undefined;
  private srgbTarget: LabeledTexture | undefined;
  private lutTarget: LabeledTexture | undefined;
  private minimalRenderSucceeded = false;
  private readonly sampler: GPUSampler;
  private readonly cameraBuffer: GPUBuffer;
  private readonly lightingBuffer: GPUBuffer;
  private readonly lightPipeline: GPURenderPipeline;
  private readonly lightLayout: GPUBindGroupLayout;
  private readonly lightSampleLayout: GPUBindGroupLayout;
  private readonly lightFallback: GPUTexture;
  private lightTarget: LabeledTexture | undefined;
  private readonly textures = new Map<string, TextureEntry>();
  private readonly validatedLuts = new Set<string>();
  private readonly fallback: TextureEntry;
  private readonly particleDot: TextureEntry;
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
    this.lightSampleLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [spriteLayout, this.lightSampleLayout] });
    const pipelineDescriptor = (targetFormat: GPUTextureFormat, linearizeInput: boolean, blend: Blend = "normal"): GPURenderPipelineDescriptor => ({
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
            { shaderLocation: 5, offset: 52, format: "float32" },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        constants: { linearizeInput: linearizeInput ? 1 : 0 },
        targets: [{
          format: targetFormat,
          blend: blend === "additive" ? {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
          } : {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.pipeline = device.createRenderPipeline(pipelineDescriptor(format, false));
    this.effectSpritePipeline = device.createRenderPipeline(pipelineDescriptor("rgba8unorm", true));
    this.additivePipeline = device.createRenderPipeline(pipelineDescriptor(format, false, "additive"));
    this.effectAdditivePipeline = device.createRenderPipeline(pipelineDescriptor("rgba8unorm", true, "additive"));
    this.lightLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ] });
    const lightModule = device.createShaderModule({ code: LIGHT_SHADER });
    this.lightPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.lightLayout] }),
      vertex: { module: lightModule, entryPoint: "vertexMain" },
      fragment: { module: lightModule, entryPoint: "fragmentMain", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list" },
    });
    this.presentLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ] });
    const presentModule = device.createShaderModule({ code: PRESENT_SHADER });
    this.presentModule = presentModule;
    this.presentPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.presentLayout] }),
      vertex: { module: presentModule, entryPoint: "vertexMain" },
      fragment: { module: presentModule, entryPoint: "fragmentMain", constants: { decodeInput: 0, encodeOutput: 1 }, targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const convertPipeline = (decodeInput: boolean): GPURenderPipeline => device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.presentLayout] }),
      vertex: { module: presentModule, entryPoint: "vertexMain" },
      fragment: { module: presentModule, entryPoint: "fragmentMain",
        constants: { decodeInput: decodeInput ? 1 : 0, encodeOutput: decodeInput ? 0 : 1 },
        targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list" },
    });
    this.toSrgbPipeline = convertPipeline(false);
    this.toLinearPipeline = convertPipeline(true);
    const hudModule = device.createShaderModule({ code: HUD_SHADER });
    this.hudPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.presentLayout] }),
      vertex: { module: hudModule, entryPoint: "vertexMain" },
      fragment: { module: hudModule, entryPoint: "fragmentMain", targets: [{ format,
        blend: { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } } }] },
      primitive: { topology: "triangle-list" },
    });
    this.effectContext = createGPUContextFromDevice(device);
    this.sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest", mipmapFilter: "nearest" });
    this.linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" });
    this.cameraBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.lightingBuffer = device.createBuffer({ size: 1568, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.lightFallback = device.createTexture({ size: [1, 1], format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: this.lightFallback }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    const fallbackTexture = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: fallbackTexture }, new Uint8Array([255, 0, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.fallback = this.textureEntry(fallbackTexture, 1, 1);
    const dotTexture = device.createTexture({ size: [PARTICLE_DOT_SIZE, PARTICLE_DOT_SIZE], format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: dotTexture }, particleDotPixels(), { bytesPerRow: PARTICLE_DOT_SIZE * 4 }, [PARTICLE_DOT_SIZE, PARTICLE_DOT_SIZE]);
    this.particleDot = this.textureEntry(dotTexture, PARTICLE_DOT_SIZE, PARTICLE_DOT_SIZE, "linear");
    void device.lost.then(() => { this.lost = true; });
  }

  get capabilities(): GameRendererCapabilities {
    return { backend: this.backend, core2D: true, gpuEffects: !this.lost && !this.disposed,
      lighting: !this.lost && !this.disposed,
      adapterType: this.adapterType, deviceStatus: this.disposed ? "disposed" : this.lost ? "lost" : "ready",
      enabledFeatures: [...this.device.features], requestedFeatures: [],
      limits: { maxTextureDimension2D: this.device.limits.maxTextureDimension2D,
        maxBufferSize: this.device.limits.maxBufferSize },
      minimalRenderSucceeded: this.minimalRenderSucceeded, deviceLossCount: this.lost ? 1 : 0,
      fallbackReason: null };
  }

  setEffects(effects: readonly GameRendererEffect[], hudOrder?: GameHudEffectOrder): void {
    if (effects.length > 8) {
      throw new Error("A game supports at most eight render effects");
    }
    for (const effect of effects) {
      if (effect.kind === "brightnessContrast" && (!Number.isFinite(effect.brightness) || effect.brightness < -1 || effect.brightness > 1 ||
        !Number.isFinite(effect.contrast) || effect.contrast < 0 || effect.contrast > 4)) {
        throw new Error("Brightness and contrast are outside the approved range");
      }
      if (effect.kind === "bloom" && (!Number.isFinite(effect.threshold) || effect.threshold < 0 || effect.threshold > 1 ||
        !Number.isFinite(effect.softness) || effect.softness < 0 || effect.softness > 0.5 ||
        !Number.isFinite(effect.radius) || effect.radius < 0 || effect.radius > 64 ||
        !Number.isFinite(effect.intensity) || effect.intensity < 0 || effect.intensity > 4)) {
        throw new Error("Bloom parameters are outside the approved range");
      }
      if (effect.kind === "lut" && (!Number.isFinite(effect.intensity) || effect.intensity < 0 || effect.intensity > 1 ||
        effect.size < 2 || effect.size > 32 || effect.domainMin.some((value, channel) => value >= effect.domainMax[channel]!))) {
        throw new Error("LUT parameters are outside the approved range");
      }
    }
    const changed = JSON.stringify(this.effects) !== JSON.stringify(effects);
    this.effects = [...effects];
    this.hudOrder = hudOrder ?? (effects.some((effect) => effect.kind === "bloom") ? "afterEffects" : "beforeEffects");
    if (changed) {
      this.effectContext.scratch.dispose();
      this.sourceTarget?.destroy();
      this.effectTarget?.destroy();
      this.srgbTarget?.destroy();
      this.lutTarget?.destroy();
      this.sourceTarget = undefined;
      this.effectTarget = undefined;
      this.srgbTarget = undefined;
      this.lutTarget = undefined;
    }
    if (effects.length === 0) {
      this.sourceTarget?.destroy();
      this.effectTarget?.destroy();
      this.srgbTarget?.destroy();
      this.lutTarget?.destroy();
      this.sourceTarget = undefined;
      this.effectTarget = undefined;
      this.srgbTarget = undefined;
      this.lutTarget = undefined;
    }
  }

  private ensureEffectTargets(): void {
    const margin = Math.ceil(this.effects.reduce((maximum, effect) => effect.kind === "bloom" ? Math.max(maximum, effect.radius * 2) : maximum, 0));
    const width = Math.max(1, this.canvas.width + margin * 2);
    const height = Math.max(1, this.canvas.height + margin * 2);
    if (width > this.device.limits.maxTextureDimension2D || height > this.device.limits.maxTextureDimension2D) {
      throw new Error("Bloom overscan exceeds the WebGPU texture limit");
    }
    if (this.sourceTarget?.width === width && this.sourceTarget.height === height) {
      return;
    }
    this.presentPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.presentLayout] }),
      vertex: { module: this.presentModule, entryPoint: "vertexMain" },
      fragment: { module: this.presentModule, entryPoint: "fragmentMain",
        constants: { decodeInput: 0, encodeOutput: 1,
          cropScaleX: this.canvas.width / width, cropScaleY: this.canvas.height / height,
          cropOffsetX: margin / width, cropOffsetY: margin / height }, targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });
    this.effectContext.scratch.dispose();
    this.sourceTarget?.destroy();
    this.effectTarget?.destroy();
    this.srgbTarget?.destroy();
    this.lutTarget?.destroy();
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.sourceTarget = createLabeledTexture(this.device, { width, height, format: "rgba8unorm", usage,
      label: "game-effect-source" });
    this.effectTarget = createLabeledTexture(this.device, { width, height, format: "rgba8unorm", usage,
      label: "game-effect-output" });
    if (this.effects.some((effect) => effect.kind === "lut")) {
      this.srgbTarget = createLabeledTexture(this.device, { width, height, format: "rgba8unorm", usage,
        label: "game-lut-source", meta: { colorSpace: "srgb" } });
      this.lutTarget = createLabeledTexture(this.device, { width, height, format: "rgba8unorm", usage,
        label: "game-lut-output", meta: { colorSpace: "srgb" } });
    }
  }

  private ensureLightTarget(width: number, height: number): LabeledTexture {
    if (width > this.device.limits.maxTextureDimension2D || height > this.device.limits.maxTextureDimension2D) {
      throw new Error("Light texture exceeds the WebGPU texture limit");
    }
    if (this.lightTarget?.width === width && this.lightTarget.height === height) return this.lightTarget;
    this.lightTarget?.destroy();
    this.lightTarget = createLabeledTexture(this.device, { width, height, format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: "game-light-texture" });
    return this.lightTarget;
  }

  private convertColor(encoder: GPUCommandEncoder, source: LabeledTexture, output: LabeledTexture,
    pipeline: GPURenderPipeline): void {
    const group = this.device.createBindGroup({ layout: this.presentLayout, entries: [
      { binding: 0, resource: this.sampler }, { binding: 1, resource: source.createView() },
    ] });
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: output.createView(),
      loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    output.markWritten();
  }

  private textureEntry(texture: GPUTexture, width: number, height: number, sampling: "nearest" | "linear" = "nearest"): TextureEntry {
    return {
      texture,
      width,
      height,
      bindGroup: this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: sampling === "linear" ? this.linearSampler : this.sampler },
          { binding: 2, resource: texture.createView() },
        ],
      }),
    };
  }

  private upload(image: GameImage | HTMLCanvasElement, sampling: "nearest" | "linear" = "nearest"): TextureEntry {
    const width = image instanceof HTMLCanvasElement ? image.width : imageWidth(image);
    const height = image instanceof HTMLCanvasElement ? image.height : imageHeight(image);
    if (width <= 0 || height <= 0) {
      return this.fallback;
    }
    // copyExternalImageToTexture requires RENDER_ATTACHMENT on the destination as well as COPY_DST.
    const texture = this.device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture, premultipliedAlpha: false }, [width, height]);
    return this.textureEntry(texture, width, height, sampling);
  }

  private async getTexture(assetId: string, sampling: "nearest" | "linear"): Promise<{ texture: TextureEntry; uploadedBytes: number }> {
    if (assetId === PARTICLE_DOT_ASSET) {
      return { texture: this.particleDot, uploadedBytes: 0 };
    }
    const cached = this.textures.get(assetId);
    if (cached) {
      return { texture: cached, uploadedBytes: 0 };
    }
    const image = await this.assets.get(assetId);
    if (!image) {
      return { texture: this.placeholder(assetId), uploadedBytes: 0 };
    }
    const texture = this.upload(image, sampling);
    this.textures.set(assetId, texture);
    return { texture, uploadedBytes: texture.width * texture.height * 4 };
  }

  private async getLutTexture(assetId: string, size: number): Promise<LabeledTexture> {
    const image = await this.assets.get(assetId);
    if (!image || imageWidth(image) !== size * size || imageHeight(image) !== size) {
      throw new Error(`LUT ${assetId} is missing or has invalid dimensions`);
    }
    if (!this.validatedLuts.has(assetId)) {
      const canvas = document.createElement("canvas");
      canvas.width = imageWidth(image);
      canvas.height = imageHeight(image);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("LUT validation requires Canvas2D");
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 255) {
          throw new Error(`LUT ${assetId} must be opaque`);
        }
      }
      this.validatedLuts.add(assetId);
    }
    const { texture } = await this.getTexture(assetId, "nearest");
    return new LabeledTexture(texture.texture, { label: `game-lut-${assetId}`, format: "rgba8unorm",
      width: texture.width, height: texture.height,
      meta: { colorSpace: "srgb", alpha: "premultiplied", bindingKind: "texture_2d" } });
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

  async render(frame: GameRenderFrame, interpolation: number, particles?: GameParticleField): Promise<GameRendererStats> {
    if (this.disposed || this.lost) {
      throw new Error(this.lost ? "WebGPU device was lost" : "Game renderer is disposed");
    }
    this.device.pushErrorScope("validation");
    let popped = false;
    try {
      const stats = await this.renderFrame(frame, interpolation, particles);
      const validationError = await this.device.popErrorScope();
      popped = true;
      if (validationError) {
        throw new Error(`WebGPU game render failed: ${validationError.message}`);
      }
      this.minimalRenderSucceeded = true;
      return stats;
    } catch (error) {
      if (!popped) {
        await this.device.popErrorScope();
      }
      throw error;
    }
  }

  private async renderFrame(frame: GameRenderFrame, interpolation: number, particles?: GameParticleField): Promise<GameRendererStats> {
    const bloomRadius = this.effects.reduce((maximum, effect) => effect.kind === "bloom" ? Math.max(maximum, effect.radius) : maximum, 0);
    const overscanPixels = Math.ceil(bloomRadius * 2);
    const overscanWorld = overscanPixels * frame.width / (Math.max(1, this.canvas.width) * projectedCamera(frame, interpolation).zoom);
    const items = visibleItems(frame, interpolation, overscanWorld, particles && { field: particles });
    const sampling = new Map(items.map((item) => [item.assetId, item.sampling]));
    const assetIds = [...sampling.keys()];
    const textureResults = await Promise.all(assetIds.map((assetId) => this.getTexture(assetId, sampling.get(assetId) ?? "nearest")));
    const textureById = new Map(assetIds.map((assetId, index) => [assetId, textureResults[index]]));
    const hudTexture = this.updateHud(frame, await loadGameUiImages(frame, (assetId) => this.assets.get(assetId)));
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
      const rect = texture.width === 1 && texture.height === 1 ? { x: 0, y: 0, width: 1, height: 1 } : sourceRect(item, texture.width, texture.height);
      const tint = parseTint(item.tint);
      const subRect = item.frame !== undefined || item.cell !== undefined;
      const insetX = item.sampling === "linear" && subRect && rect.width > 1 ? 0.5 : 0;
      const insetY = item.sampling === "linear" && subRect && rect.height > 1 ? 0.5 : 0;
      const u = (rect.x + insetX) / texture.width;
      const v = (rect.y + insetY) / texture.height;
      const du = (rect.width - 2 * insetX) / texture.width;
      const dv = (rect.height - 2 * insetY) / texture.height;
      writeInstance(instances, index, item.x, item.y, item.width, item.height,
        item.flipX ? u + du : u, item.flipY ? v + dv : v, item.flipX ? -du : du, item.flipY ? -dv : dv,
        tint[0], tint[1], tint[2], item.opacity, item.rotation, item.unlit ? 1 : 0);
      appendBatch(batches, texture, item.blend, index);
    }
    if (hudTexture) {
      const scale = frame.camera.zoom;
      const projected = projectedCamera(frame, interpolation);
      writeInstance(instances, items.length, projected.x, projected.y,
        frame.width / scale, frame.height / scale, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1);
      appendBatch(batches, hudTexture, "normal", items.length);
    }
    const projected = projectedCamera(frame, interpolation);
    const camera = new Float32Array([projected.x, projected.y,
      frame.width * (this.canvas.width + overscanPixels * 2) / Math.max(1, this.canvas.width),
      frame.height * (this.canvas.height + overscanPixels * 2) / Math.max(1, this.canvas.height),
      frame.camera.zoom, 0, 0, 0]);
    this.device.queue.writeBuffer(this.cameraBuffer, 0, camera);
    const sceneLighting = frame.lighting;
    const lighting = gameLightingUniforms(frame);
    this.device.queue.writeBuffer(this.lightingBuffer, 0, lighting);
    if (count > 0 && this.instanceBuffer) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, instances);
    }
    const encoder = this.device.createCommandEncoder();
    const hasEffects = this.effects.length > 0;
    const hudAfterEffects = hasEffects && this.hudOrder === "afterEffects";
    if (hasEffects) {
      this.ensureEffectTargets();
    }
    if (!sceneLighting && this.lightTarget) {
      this.lightTarget.destroy();
      this.lightTarget = undefined;
    }
    await this.renderPipeline.render({
      lighting: () => {
        if (sceneLighting) {
          const target = this.ensureLightTarget(this.canvas.width + (hasEffects ? overscanPixels * 2 : 0),
            this.canvas.height + (hasEffects ? overscanPixels * 2 : 0));
          const lightGroup = this.device.createBindGroup({ layout: this.lightLayout, entries: [
            { binding: 0, resource: { buffer: this.cameraBuffer } },
            { binding: 1, resource: { buffer: this.lightingBuffer } },
          ] });
          const lightPass = encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(),
            loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
          lightPass.setPipeline(this.lightPipeline);
          lightPass.setBindGroup(0, lightGroup);
          lightPass.draw(3);
          lightPass.end();
          target.markWritten();
        }
      },
      sprites: () => {
        const lightSampleGroup = this.device.createBindGroup({ layout: this.lightSampleLayout, entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: (this.lightTarget?.texture ?? this.lightFallback).createView() },
        ] });
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: hasEffects ? this.sourceTarget!.createView() : this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }] });
        if (this.instanceBuffer) {
          pass.setVertexBuffer(0, this.instanceBuffer);
          pass.setBindGroup(1, lightSampleGroup);
          let blend: Blend | undefined;
          for (const batch of batches) {
            if (hudAfterEffects && batch.first >= items.length) {
              continue;
            }
            if (batch.blend !== blend) {
              blend = batch.blend;
              pass.setPipeline(blend === "additive"
                ? hasEffects ? this.effectAdditivePipeline : this.additivePipeline
                : hasEffects ? this.effectSpritePipeline : this.pipeline);
            }
            pass.setBindGroup(0, batch.texture.bindGroup);
            pass.draw(6, batch.count, 0, batch.first);
      }
    }
    pass.end();
      },
      effects: async () => {
        if (hasEffects) {
          let source = this.sourceTarget!;
          const output = this.effectTarget!;
          source = await encodeGameEffects({ effects: this.effects, source, output, encoder,
            effectContext: this.effectContext, effectExecutor: this.effectExecutor,
            effectRecipeRunner: this.effectRecipeRunner, effectRegistry: this.effectRegistry,
            srgbTarget: this.srgbTarget, lutTarget: this.lutTarget, toSrgbPipeline: this.toSrgbPipeline,
            toLinearPipeline: this.toLinearPipeline, getLutTexture: (id, size) => this.getLutTexture(id, size),
            convertColor: (command, input, target, pipeline) => this.convertColor(command, input, target, pipeline) });
          const presentGroup = this.device.createBindGroup({ layout: this.presentLayout, entries: [
            { binding: 0, resource: this.sampler }, { binding: 1, resource: source.createView() },
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
      },
      hud: () => {
          if (hudAfterEffects && hudTexture) {
            const hudGroup = this.device.createBindGroup({ layout: this.presentLayout, entries: [
              { binding: 0, resource: this.sampler }, { binding: 1, resource: hudTexture.texture.createView() },
            ] });
            const hudPass = encoder.beginRenderPass({ colorAttachments: [{
              view: this.context.getCurrentTexture().createView(), loadOp: "load", storeOp: "store",
            }] });
            hudPass.setPipeline(this.hudPipeline);
            hudPass.setBindGroup(0, hudGroup);
            hudPass.draw(3);
            hudPass.end();
      }
      }
    });
    this.device.queue.submit([encoder.finish()]);
    const textureBytes = [...this.textures.values(), ...this.placeholders.values(), this.fallback, this.particleDot,
      ...(this.hudTexture ? [this.hudTexture] : [])].reduce((sum, entry) => sum + entry.width * entry.height * 4, 0);
    return {
      backend: this.backend,
      visibleSprites: items.length,
      drawCalls: batches.length + this.effects.reduce((sum, effect) => sum + (effect.kind === "bloom" ? 4 : effect.kind === "lut" ? 3 : 1), 0) + (hasEffects ? 1 : 0) + (sceneLighting ? 1 : 0),
      uploadedBytes: textureResults.reduce((sum, result) => sum + result.uploadedBytes, 0),
      textureBytes,
      targetBytes: (this.sourceTarget && this.effectTarget ? (this.sourceTarget.width * this.sourceTarget.height +
        this.effectTarget.width * this.effectTarget.height + (this.effects.some((effect) => effect.kind === "bloom") ?
          this.sourceTarget.width * this.sourceTarget.height * 3 : 0) + (this.srgbTarget && this.lutTarget ?
          this.srgbTarget.width * this.srgbTarget.height + this.lutTarget.width * this.lutTarget.height : 0)) * 4 : 0) +
        (this.lightTarget ? this.lightTarget.width * this.lightTarget.height * 8 : 0),
      instanceBufferBytes: this.instanceCapacity * INSTANCE_FLOATS * 4,
    };
  }

  private updateHud(frame: GameRenderFrame, images: ReadonlyMap<string, GameImage>): TextureEntry | undefined {
    if (frame.hud.length === 0 && !frame.ui) {
      return undefined;
    }
    const key = JSON.stringify([this.canvas.width, this.canvas.height, frame.hud, frame.ui, [...images.keys()]]);
    if (key !== this.hudKey) {
      const canvas = this.hudCanvas ?? document.createElement("canvas");
      paintWebGPUHud(canvas, this.canvas.width, this.canvas.height, frame, images);
      this.hudTexture?.texture.destroy();
      this.hudTexture = this.upload(canvas);
      this.hudCanvas = canvas;
      this.hudKey = key;
    }
    return this.hudTexture;
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
    this.lightTarget?.destroy();
    this.srgbTarget?.destroy();
    this.lutTarget?.destroy();
    this.effectContext.scratch.dispose();
    this.sourceTarget = undefined;
    this.effectTarget = undefined;
    this.lightTarget = undefined;
    this.srgbTarget = undefined;
    this.lutTarget = undefined;
  }

  invalidateAsset(assetId: string): void {
    this.assets.invalidate(assetId);
    const texture = this.textures.get(assetId);
    texture?.texture.destroy();
    this.textures.delete(assetId);
    this.validatedLuts.delete(assetId);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.instanceBuffer?.destroy();
    this.sourceTarget?.destroy();
    this.effectTarget?.destroy();
    this.srgbTarget?.destroy();
    this.lutTarget?.destroy();
    this.effectContext.scratch.dispose();
    this.effectContext.uniformRing.dispose();
    this.effectContext.root.destroy();
    this.cameraBuffer.destroy();
    this.lightingBuffer.destroy();
    this.lightTarget?.destroy();
    this.lightFallback.destroy();
    this.fallback.texture.destroy();
    this.particleDot.texture.destroy();
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

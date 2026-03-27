/**
 * WebGPURuntime
 *
 * WebGPU implementation of the SketchRuntime interface.
 * Manages GPU device/context, layer textures, and compositing.
 *
 * Layer content is still authored on CPU Canvas2D (Phase 2 scope).
 * The runtime uploads dirty layer canvases to GPU textures, then
 * composites them on the GPU for display.
 *
 * Readback (flatten / mask export) goes: GPU texture → CPU canvas → data URL
 * via the same Canvas2DRuntime helpers (kept as a readback fallback).
 */

import type { SketchRuntime, ActiveStrokeInfo, DirtyRect } from "./types";
import {
  isLayerCompositeVisible,
  type BlendMode,
  type LayerContentBounds,
  type Selection,
  type SketchDocument
} from "../types";
import { Canvas2DRuntime } from "./Canvas2DRuntime";
import { blendModeToComposite, checkerboardDocumentCellPx } from "../drawingUtils";
import { getLayerCompositeOffset } from "../painting/layerBounds";
import {
  FULLSCREEN_QUAD_VERTEX,
  CHECKERBOARD_FRAGMENT,
  LAYER_COMPOSITE_FRAGMENT,
  BORDER_FRAGMENT
} from "./shaders";

// ─── Blend mode → GPUBlendState mapping ──────────────────────────────────

function blendModeToGPUBlend(mode: BlendMode | string): GPUBlendState {
  // Uploaded layer/stroke textures come from Canvas2D sources and are treated
  // here as straight-alpha samples. Use a standard source-over blend so both
  // partially transparent fills and live brush previews stay visible.
  switch (mode) {
    case "normal":
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

// ─── WebGPURuntime ───────────────────────────────────────────────────────

export class WebGPURuntime implements SketchRuntime {
  // ── GPU state ────────────────────────────────────────────────────────
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat;
  private targetCanvas: HTMLCanvasElement | null = null;

  // ── Pipelines ────────────────────────────────────────────────────────
  private checkerboardPipeline: GPURenderPipeline | null = null;
  private checkerboardBindGroupLayout: GPUBindGroupLayout | null = null;
  private layerPipeline: GPURenderPipeline | null = null;
  private layerBindGroupLayout: GPUBindGroupLayout | null = null;
  private borderPipeline: GPURenderPipeline | null = null;
  private borderBindGroupLayout: GPUBindGroupLayout | null = null;

  // ── Layer textures ───────────────────────────────────────────────────
  private layerTextures = new Map<string, GPUTexture>();

  /** CPU merge (layer + stroke buffer) uploaded each frame while a buffered stroke is active. */
  private strokeMergeCpuCanvas: HTMLCanvasElement | null = null;
  private strokeMergeTexture: GPUTexture | null = null;

  // ── CPU-side fallback for readback & layer pixel ops ─────────────────
  private cpuRuntime: Canvas2DRuntime;
  private layerCanvases: Map<string, HTMLCanvasElement>;

  /**
   * Current zoom level – used to scale the checkerboard cell so
   * the visual size stays constant on screen.
   */
  zoom = 1;

  // ── Dirty tracking ───────────────────────────────────────────────────
  /** Layers whose CPU canvas changed and need re-upload to GPU. */
  private dirtyLayers = new Set<string>();

  constructor(
    device: GPUDevice,
    layerCanvases?: Map<string, HTMLCanvasElement>
  ) {
    this.device = device;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.layerCanvases = layerCanvases ?? new Map();
    this.cpuRuntime = new Canvas2DRuntime(this.layerCanvases);
    this.initPipelines();
  }

  // ─── Pipeline initialization ─────────────────────────────────────────

  private initPipelines(): void {
    const device = this.device;

    // Shared vertex shader module
    const vertexModule = device.createShaderModule({
      label: "fullscreen-quad-vert",
      code: FULLSCREEN_QUAD_VERTEX
    });

    // ── Checkerboard ───────────────────────────────────────────────────
    const checkerboardModule = device.createShaderModule({
      label: "checkerboard-frag",
      code: FULLSCREEN_QUAD_VERTEX + CHECKERBOARD_FRAGMENT
    });

    this.checkerboardBindGroupLayout = device.createBindGroupLayout({
      label: "checkerboard-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }
      ]
    });

    this.checkerboardPipeline = device.createRenderPipeline({
      label: "checkerboard-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.checkerboardBindGroupLayout]
      }),
      vertex: {
        module: checkerboardModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: checkerboardModule,
        entryPoint: "fs_checkerboard",
        targets: [{ format: this.presentationFormat }]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // ── Layer composite ────────────────────────────────────────────────
    const layerModule = device.createShaderModule({
      label: "layer-composite-frag",
      code: FULLSCREEN_QUAD_VERTEX + LAYER_COMPOSITE_FRAGMENT
    });

    this.layerBindGroupLayout = device.createBindGroupLayout({
      label: "layer-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });

    this.layerPipeline = device.createRenderPipeline({
      label: "layer-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.layerBindGroupLayout]
      }),
      vertex: {
        module: layerModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: layerModule,
        entryPoint: "fs_layer",
        targets: [
          {
            format: this.presentationFormat,
            blend: blendModeToGPUBlend("normal")
          }
        ]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // ── Border ─────────────────────────────────────────────────────────
    const borderModule = device.createShaderModule({
      label: "border-frag",
      code: FULLSCREEN_QUAD_VERTEX + BORDER_FRAGMENT
    });

    this.borderBindGroupLayout = device.createBindGroupLayout({
      label: "border-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }
      ]
    });

    this.borderPipeline = device.createRenderPipeline({
      label: "border-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.borderBindGroupLayout]
      }),
      vertex: {
        module: borderModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: borderModule,
        entryPoint: "fs_border",
        targets: [
          {
            format: this.presentationFormat,
            blend: blendModeToGPUBlend("normal")
          }
        ]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

  }

  // ─── Canvas context management ───────────────────────────────────────

  /**
   * Configure the WebGPU context for the given display canvas.
   * Must be called before compositeToDisplay.
   */
  configureContext(canvas: HTMLCanvasElement): void {
    if (this.targetCanvas === canvas && this.context) {
      return;
    }
    this.targetCanvas = canvas;
    const ctx = canvas.getContext("webgpu");
    if (!ctx) {
      throw new Error("Failed to get WebGPU context from canvas");
    }
    this.context = ctx;
    ctx.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: "premultiplied"
    });
  }

  // ─── Layer texture management ────────────────────────────────────────

  private getOrCreateLayerTexture(
    layerId: string,
    width: number,
    height: number
  ): GPUTexture {
    const existing = this.layerTextures.get(layerId);
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }
    // Destroy old texture if size changed
    if (existing) {
      existing.destroy();
    }
    const texture = this.device.createTexture({
      label: `layer-${layerId}`,
      size: { width: Math.max(1, width), height: Math.max(1, height) },
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.layerTextures.set(layerId, texture);
    return texture;
  }

  /**
   * Upload a CPU canvas to its corresponding GPU texture.
   */
  private uploadLayerToGPU(layerId: string): void {
    const canvas = this.layerCanvases.get(layerId);
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      return;
    }
    // Always ensure the GPU texture entry exists so the compositing loop
    // doesn't skip this layer due to a missing texture.
    const texture = this.getOrCreateLayerTexture(
      layerId,
      canvas.width,
      canvas.height
    );
    // copyExternalImageToTexture requires the canvas to have an active
    // rendering context. Layer canvases always use "2d"; calling getContext
    // here is a no-op if the context was already acquired (the common case),
    // and a safe initializer if the canvas was just created but not yet drawn
    // to (blank layer). Skip the upload if the context cannot be obtained.
    if (!canvas.getContext("2d")) {
      return;
    }
    this.device.queue.copyExternalImageToTexture(
      { source: canvas, flipY: false },
      { texture },
      { width: canvas.width, height: canvas.height }
    );
  }

  private syncDirtyLayers(): void {
    for (const layerId of this.dirtyLayers) {
      this.uploadLayerToGPU(layerId);
    }
    this.dirtyLayers.clear();
  }

  /**
   * Upload layers that need a GPU texture update: dirty layers AND layers
   * whose texture doesn't exist yet (handles the initial switch from
   * Canvas2DRuntime where all existing CPU canvases have no GPU counterpart).
   */
  private syncLayerTextures(): void {
    for (const [layerId] of this.layerCanvases) {
      if (this.dirtyLayers.has(layerId) || !this.layerTextures.has(layerId)) {
        this.uploadLayerToGPU(layerId);
      }
    }
    this.dirtyLayers.clear();
  }

  private markLayerDirty(layerId: string): void {
    this.dirtyLayers.add(layerId);
  }

  // ─── SketchRuntime: Layer canvas management ──────────────────────────

  getOrCreateLayerCanvas(
    layerId: string,
    width: number,
    height: number
  ): HTMLCanvasElement {
    const canvas = this.cpuRuntime.getOrCreateLayerCanvas(
      layerId,
      width,
      height
    );
    this.markLayerDirty(layerId);
    return canvas;
  }

  getLayerCanvas(layerId: string): HTMLCanvasElement | undefined {
    return this.cpuRuntime.getLayerCanvas(layerId);
  }

  deleteLayerCanvas(layerId: string): void {
    this.cpuRuntime.deleteLayerCanvas(layerId);
    const texture = this.layerTextures.get(layerId);
    if (texture) {
      texture.destroy();
      this.layerTextures.delete(layerId);
    }
    this.dirtyLayers.delete(layerId);
  }

  invalidateLayer(layerId: string): void {
    this.markLayerDirty(layerId);
  }

  /**
   * Rasterize layer canvas + stroke buffer on CPU (same as Canvas2DRuntime) and
   * upload to a transient GPU texture for compositing.
   */
  private uploadStrokeMergePreview(stroke: ActiveStrokeInfo): GPUTexture | null {
    const layerCanvas = this.layerCanvases.get(stroke.layerId);
    if (!layerCanvas || layerCanvas.width <= 0 || layerCanvas.height <= 0) {
      return null;
    }
    if (!layerCanvas.getContext("2d")) {
      return null;
    }
    if (!stroke.buffer.getContext("2d")) {
      return null;
    }
    const w = layerCanvas.width;
    const h = layerCanvas.height;
    if (
      !this.strokeMergeCpuCanvas ||
      this.strokeMergeCpuCanvas.width !== w ||
      this.strokeMergeCpuCanvas.height !== h
    ) {
      this.strokeMergeCpuCanvas = document.createElement("canvas");
      this.strokeMergeCpuCanvas.width = w;
      this.strokeMergeCpuCanvas.height = h;
    }
    const sctx = this.strokeMergeCpuCanvas.getContext("2d");
    if (!sctx) {
      return null;
    }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "source-over";
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(layerCanvas, 0, 0);
    sctx.save();
    sctx.globalAlpha = stroke.opacity;
    sctx.globalCompositeOperation = stroke.compositeOp;
    sctx.drawImage(stroke.buffer, 0, 0);
    sctx.restore();

    if (
      !this.strokeMergeTexture ||
      this.strokeMergeTexture.width !== w ||
      this.strokeMergeTexture.height !== h
    ) {
      if (this.strokeMergeTexture) {
        this.strokeMergeTexture.destroy();
      }
      this.strokeMergeTexture = this.device.createTexture({
        label: "stroke-merge-preview",
        size: { width: w, height: h },
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
    }
    this.device.queue.copyExternalImageToTexture(
      { source: this.strokeMergeCpuCanvas, flipY: false },
      { texture: this.strokeMergeTexture },
      { width: w, height: h }
    );
    return this.strokeMergeTexture;
  }

  // ─── SketchRuntime: Compositing ──────────────────────────────────────

  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    dirtyRect?: DirtyRect | null
  ): void {
    // Ensure context is configured for this canvas
    this.configureContext(targetCanvas);
    if (!this.context) {
      return;
    }

    // Upload CPU canvas → GPU texture for any layer that is dirty or whose
    // texture doesn't exist yet (handles initial sync after the WebGPU runtime
    // takes over from Canvas2DRuntime). "Full redraw" controls compositing
    // scope (full canvas vs. dirty rect clip), not upload scope — we never
    // need to re-upload unchanged layers just because the clip region changed.
    this.syncLayerTextures();

    const device = this.device;
    const textureView = this.context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({
      label: "composite-frame"
    });

    const fullW = targetCanvas.width;
    const fullH = targetCanvas.height;

    // ── Pass 1: Checkerboard background ───────────────────────────────
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });

      if (this.checkerboardPipeline && this.checkerboardBindGroupLayout) {
        // Checkerboard uniforms: canvasSize, cellSize, pad, colorA, colorB
        // Integer document cell size (see checkerboardDocumentCellPx) so GPU
        // tiles match Canvas2D and stay even under CSS scale + pixelated view.
        const effectiveCell = checkerboardDocumentCellPx(this.zoom);
        const uniformData = new Float32Array([
          fullW,
          fullH,
          effectiveCell,
          0.0, // canvasSize, cellSize, pad
          0x2a / 255,
          0x2a / 255,
          0x2a / 255,
          1.0, // colorA (#2a2a2a)
          0x3a / 255,
          0x3a / 255,
          0x3a / 255,
          1.0 // colorB (#3a3a3a)
        ]);
        const uniformBuffer = device.createBuffer({
          size: uniformData.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        const bindGroup = device.createBindGroup({
          layout: this.checkerboardBindGroupLayout,
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
        });

        pass.setPipeline(this.checkerboardPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4);
      }

      pass.end();
    }

    // ── Pass 2: Layer compositing ─────────────────────────────────────
    const mergeTex =
      activeStroke != null ? this.uploadStrokeMergePreview(activeStroke) : null;

    for (const layer of doc.layers) {
      if (!isLayerCompositeVisible(doc.layers, layer, isolatedLayerId)) {
        continue;
      }
      if (isolatedLayerId && layer.id !== isolatedLayerId) {
        continue;
      }

      const layerTexture = this.layerTextures.get(layer.id);
      if (!layerTexture) {
        continue;
      }
      const drawTex =
        mergeTex != null &&
        activeStroke != null &&
        layer.id === activeStroke.layerId
          ? mergeTex
          : layerTexture;
      this.compositeLayerGPU(encoder, textureView, layer, fullW, fullH, drawTex);
    }

    // ── Pass 3: Border ────────────────────────────────────────────────
    if (!dirtyRect && this.borderPipeline && this.borderBindGroupLayout) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            loadOp: "load",
            storeOp: "store"
          }
        ]
      });

      const borderData = new Float32Array([
        fullW,
        fullH,
        1.0,
        0.0, // canvasSize, lineWidth, pad
        1.0,
        1.0,
        1.0,
        0.25 // color (rgba)
      ]);
      const borderBuffer = device.createBuffer({
        size: borderData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      device.queue.writeBuffer(borderBuffer, 0, borderData);

      const bindGroup = device.createBindGroup({
        layout: this.borderBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: borderBuffer } }]
      });

      pass.setPipeline(this.borderPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
  }

  private compositeLayerGPU(
    encoder: GPUCommandEncoder,
    textureView: GPUTextureView,
    layer: {
      id: string;
      opacity: number;
      blendMode?: BlendMode | string;
      transform?: { x?: number; y?: number };
      contentBounds?: { x?: number; y?: number; width?: number; height?: number };
    },
    canvasW: number,
    canvasH: number,
    sourceTexture?: GPUTexture
  ): void {
    if (!this.layerPipeline || !this.layerBindGroupLayout) {
      return;
    }

    const layerTexture = sourceTexture ?? this.layerTextures.get(layer.id);
    if (!layerTexture) {
      return;
    }

    const compositeOffset = getLayerCompositeOffset(layer, {
      width: layerTexture.width,
      height: layerTexture.height
    }, this.layerCanvases.get(layer.id));
    this.drawTextureGPU(
      encoder,
      textureView,
      layerTexture,
      layer.opacity,
      compositeOffset.x,
      compositeOffset.y,
      canvasW,
      canvasH
    );
  }

  private drawTextureGPU(
    encoder: GPUCommandEncoder,
    textureView: GPUTextureView,
    texture: GPUTexture,
    opacity: number,
    tx: number,
    ty: number,
    canvasW: number,
    canvasH: number
  ): void {
    if (!this.layerPipeline || !this.layerBindGroupLayout) {
      return;
    }

    const scaleU = canvasW / texture.width;
    const scaleV = canvasH / texture.height;
    // Uniforms:
    // params0 = [opacity, offsetU, offsetV, pad]
    // params1 = [canvasW / textureW, canvasH / textureH, pad, pad]
    const uniformData = new Float32Array([
      opacity,
      tx / canvasW,
      ty / canvasH,
      0.0,
      scaleU,
      scaleV,
      0.0,
      0.0
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.layerBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: texture.createView() }
      ]
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: "load",
          storeOp: "store"
        }
      ]
    });

    pass.setPipeline(this.layerPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  // ─── SketchRuntime: Readback / export ────────────────────────────────
  // All readback goes through the CPU runtime which has the authoritative
  // layer canvases.

  getLayerData(layerId: string): string | null {
    return this.cpuRuntime.getLayerData(layerId);
  }

  snapshotLayerCanvas(layerId: string): HTMLCanvasElement | null {
    return this.cpuRuntime.snapshotLayerCanvas(layerId);
  }

  flattenToDataUrl(doc: SketchDocument): string {
    return this.cpuRuntime.flattenToDataUrl(doc);
  }

  getMaskDataUrl(doc: SketchDocument): string | null {
    return this.cpuRuntime.getMaskDataUrl(doc);
  }

  flattenVisible(doc: SketchDocument): string {
    return this.cpuRuntime.flattenVisible(doc);
  }

  // ─── SketchRuntime: Layer operations ─────────────────────────────────
  // All mutations go through the CPU runtime; we mark the layer dirty so
  // the next compositeToDisplay will re-upload.

  setLayerData(
    layerId: string,
    data: string | null,
    bounds: LayerContentBounds,
    onComplete?: () => void
  ): void {
    this.cpuRuntime.setLayerData(layerId, data, bounds, () => {
      this.markLayerDirty(layerId);
      onComplete?.();
    });
  }

  restoreLayerCanvas(layerId: string, source: HTMLCanvasElement): void {
    this.cpuRuntime.restoreLayerCanvas(layerId, source);
    this.markLayerDirty(layerId);
  }

  clearLayer(layerId: string): void {
    this.cpuRuntime.clearLayer(layerId);
    this.markLayerDirty(layerId);
  }

  clearLayerRect(
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.cpuRuntime.clearLayerRect(layerId, x, y, width, height);
    this.markLayerDirty(layerId);
  }

  flipLayer(layerId: string, direction: "horizontal" | "vertical"): void {
    this.cpuRuntime.flipLayer(layerId, direction);
    this.markLayerDirty(layerId);
  }

  fillLayerWithColor(layerId: string, color: string): void {
    this.cpuRuntime.fillLayerWithColor(layerId, color);
    this.markLayerDirty(layerId);
  }

  fillLayerRect(
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ): void {
    this.cpuRuntime.fillLayerRect(layerId, x, y, width, height, color);
    this.markLayerDirty(layerId);
  }

  clearLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection
  ): void {
    this.cpuRuntime.clearLayerBySelectionMask(layerId, offsetX, offsetY, mask);
    this.markLayerDirty(layerId);
  }

  fillLayerBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
    color: string
  ): void {
    this.cpuRuntime.fillLayerBySelectionMask(
      layerId,
      offsetX,
      offsetY,
      mask,
      color
    );
    this.markLayerDirty(layerId);
  }

  nudgeLayer(layerId: string, dx: number, dy: number): void {
    this.cpuRuntime.nudgeLayer(layerId, dx, dy);
    this.markLayerDirty(layerId);
  }

  trimLayerToBounds(
    layerId: string
  ): { data: string; bounds: LayerContentBounds } | null {
    const result = this.cpuRuntime.trimLayerToBounds(layerId);
    if (result) {
      this.markLayerDirty(layerId);
    }
    return result;
  }

  mergeLayerDown(
    upperLayerId: string,
    lowerLayerId: string,
    doc: SketchDocument
  ): string | undefined {
    const result = this.cpuRuntime.mergeLayerDown(
      upperLayerId,
      lowerLayerId,
      doc
    );
    // Clean up upper layer's GPU texture
    const upperTexture = this.layerTextures.get(upperLayerId);
    if (upperTexture) {
      upperTexture.destroy();
      this.layerTextures.delete(upperLayerId);
    }
    this.dirtyLayers.delete(upperLayerId);
    this.markLayerDirty(lowerLayerId);
    return result;
  }

  cropLayers(x: number, y: number, width: number, height: number): void {
    this.cpuRuntime.cropLayers(x, y, width, height);
    // All textures need recreation at new size
    for (const [layerId, texture] of this.layerTextures) {
      texture.destroy();
      this.layerTextures.delete(layerId);
      this.markLayerDirty(layerId);
    }
  }

  applyAdjustments(
    doc: SketchDocument,
    brightness: number,
    contrast: number,
    saturation: number
  ): void {
    this.cpuRuntime.applyAdjustments(doc, brightness, contrast, saturation);
    if (doc.activeLayerId) {
      this.markLayerDirty(doc.activeLayerId);
    }
  }

  reconcileLayerToDocumentSpace(
    layerId: string,
    doc: SketchDocument
  ): string | null {
    const result = this.cpuRuntime.reconcileLayerToDocumentSpace(layerId, doc);
    if (result !== null) {
      this.markLayerDirty(layerId);
    }
    return result;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  dispose(): void {
    for (const [, texture] of this.layerTextures) {
      texture.destroy();
    }
    this.layerTextures.clear();
    if (this.strokeMergeTexture) {
      this.strokeMergeTexture.destroy();
      this.strokeMergeTexture = null;
    }
    this.strokeMergeCpuCanvas = null;
    this.cpuRuntime.dispose();
    this.dirtyLayers.clear();
    this.context = null;
    this.targetCanvas = null;
  }
}

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
import type { SketchDocument } from "../types";
import { Canvas2DRuntime } from "./Canvas2DRuntime";
import { blendModeToComposite } from "../drawingUtils";
import type { BlendMode } from "../types";
import {
  FULLSCREEN_QUAD_VERTEX,
  CHECKERBOARD_FRAGMENT,
  LAYER_COMPOSITE_FRAGMENT,
  BORDER_FRAGMENT
} from "./shaders";

// ─── Blend mode → GPUBlendState mapping ──────────────────────────────────

function blendModeToGPUBlend(mode: BlendMode | string): GPUBlendState {
  // For most modes we use premultiplied-alpha "source-over" and rely on
  // the fragment shader writing premultiplied color.  True Photoshop-style
  // blend modes (multiply, screen, overlay, etc.) would need multi-pass or
  // a different approach.  Phase 2 supports "normal" perfectly; other modes
  // fall back to the same alpha-blend which is visually close enough for now.
  switch (mode) {
    case "normal":
    default:
      return {
        color: {
          srcFactor: "one",
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
  private sampler: GPUSampler | null = null;

  // ── Layer textures ───────────────────────────────────────────────────
  private layerTextures = new Map<string, GPUTexture>();

  // ── CPU-side fallback for readback & layer pixel ops ─────────────────
  private cpuRuntime: Canvas2DRuntime;
  private layerCanvases: Map<string, HTMLCanvasElement>;

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
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
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

    // ── Shared sampler ─────────────────────────────────────────────────
    this.sampler = device.createSampler({
      label: "layer-sampler",
      magFilter: "nearest",
      minFilter: "nearest"
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
    const texture = this.getOrCreateLayerTexture(
      layerId,
      canvas.width,
      canvas.height
    );
    this.device.queue.copyExternalImageToTexture(
      { source: canvas, flipY: false },
      { texture },
      { width: canvas.width, height: canvas.height }
    );
  }

  /**
   * Upload a CPU canvas for the active stroke buffer to a temporary GPU texture.
   */
  private uploadStrokeBufferToGPU(
    activeStroke: ActiveStrokeInfo
  ): GPUTexture {
    const buffer = activeStroke.buffer;
    const texture = this.device.createTexture({
      label: "stroke-buffer",
      size: {
        width: Math.max(1, buffer.width),
        height: Math.max(1, buffer.height)
      },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.copyExternalImageToTexture(
      { source: buffer, flipY: false },
      { texture },
      { width: buffer.width, height: buffer.height }
    );
    return texture;
  }

  private syncDirtyLayers(): void {
    for (const layerId of this.dirtyLayers) {
      this.uploadLayerToGPU(layerId);
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

    // Upload any dirty CPU canvases to GPU
    // For a full redraw, re-upload all layers; for dirty-rect, only dirty ones
    if (!dirtyRect) {
      // Full redraw: upload all layers
      for (const [layerId] of this.layerCanvases) {
        this.uploadLayerToGPU(layerId);
      }
      this.dirtyLayers.clear();
    } else {
      this.syncDirtyLayers();
    }

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
        const uniformData = new Float32Array([
          fullW,
          fullH,
          8.0,
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
    for (const layer of doc.layers) {
      if (!layer.visible) {
        continue;
      }
      if (isolatedLayerId && layer.id !== isolatedLayerId) {
        continue;
      }

      const layerTexture = this.layerTextures.get(layer.id);
      if (!layerTexture) {
        continue;
      }

      const hasActiveStroke =
        activeStroke && activeStroke.layerId === layer.id;

      if (hasActiveStroke) {
        // For active strokes, we need to composite the layer + stroke buffer.
        // Upload stroke buffer and composite in a separate pass using the
        // CPU temp-canvas approach (same as Canvas2DRuntime) for now.
        // This keeps the stroke preview correct for all blend modes.
        this.compositeLayerWithStrokeGPU(
          encoder,
          textureView,
          layer,
          activeStroke,
          fullW,
          fullH
        );
      } else {
        this.compositeLayerGPU(
          encoder,
          textureView,
          layer,
          fullW,
          fullH
        );
      }
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
    layer: { id: string; opacity: number; blendMode?: BlendMode | string; transform?: { x?: number; y?: number } },
    canvasW: number,
    canvasH: number
  ): void {
    if (!this.layerPipeline || !this.layerBindGroupLayout || !this.sampler) {
      return;
    }

    const layerTexture = this.layerTextures.get(layer.id);
    if (!layerTexture) {
      return;
    }

    const tx = layer.transform?.x ?? 0;
    const ty = layer.transform?.y ?? 0;

    // Uniforms: opacity, offsetU, offsetV, pad
    const uniformData = new Float32Array([
      layer.opacity,
      tx / canvasW,
      ty / canvasH,
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
        { binding: 1, resource: layerTexture.createView() },
        { binding: 2, resource: this.sampler }
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

  /**
   * Composite a layer that has an active stroke on top of it.
   *
   * Strategy: merge layer + stroke buffer on CPU into a temp canvas,
   * upload that to a temp GPU texture, and draw it as one layer.
   * This gives correct results for eraser (destination-out) strokes.
   */
  private compositeLayerWithStrokeGPU(
    encoder: GPUCommandEncoder,
    textureView: GPUTextureView,
    layer: { id: string; opacity: number; blendMode?: BlendMode | string; transform?: { x?: number; y?: number } },
    activeStroke: ActiveStrokeInfo,
    canvasW: number,
    canvasH: number
  ): void {
    if (!this.layerPipeline || !this.layerBindGroupLayout || !this.sampler) {
      return;
    }

    const layerCanvas = this.layerCanvases.get(layer.id);
    if (!layerCanvas) {
      return;
    }

    // Merge layer + stroke buffer on CPU
    const temp = window.document.createElement("canvas");
    temp.width = layerCanvas.width;
    temp.height = layerCanvas.height;
    const tempCtx = temp.getContext("2d");
    if (!tempCtx) {
      return;
    }
    tempCtx.drawImage(layerCanvas, 0, 0);
    tempCtx.save();
    tempCtx.globalAlpha = activeStroke.opacity;
    tempCtx.globalCompositeOperation = activeStroke.compositeOp;
    tempCtx.drawImage(activeStroke.buffer, 0, 0);
    tempCtx.restore();

    // Upload merged temp canvas to a temporary texture
    const tempTexture = this.device.createTexture({
      label: `layer-stroke-${layer.id}`,
      size: {
        width: Math.max(1, temp.width),
        height: Math.max(1, temp.height)
      },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.copyExternalImageToTexture(
      { source: temp, flipY: false },
      { texture: tempTexture },
      { width: temp.width, height: temp.height }
    );

    const tx = layer.transform?.x ?? 0;
    const ty = layer.transform?.y ?? 0;

    const uniformData = new Float32Array([
      layer.opacity,
      tx / canvasW,
      ty / canvasH,
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
        { binding: 1, resource: tempTexture.createView() },
        { binding: 2, resource: this.sampler }
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

    // Temp texture will be GC'd after the command buffer is submitted
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
    width: number,
    height: number,
    onComplete?: () => void
  ): void {
    this.cpuRuntime.setLayerData(layerId, data, width, height, () => {
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

  nudgeLayer(layerId: string, dx: number, dy: number): void {
    this.cpuRuntime.nudgeLayer(layerId, dx, dy);
    this.markLayerDirty(layerId);
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
    const result = this.cpuRuntime.reconcileLayerToDocumentSpace(
      layerId,
      doc
    );
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
    this.cpuRuntime.dispose();
    this.dirtyLayers.clear();
    this.context = null;
    this.targetCanvas = null;
  }
}

/**
 * WebGPURuntime
 *
 * WebGPU implementation of the SketchRuntime interface.
 * Manages GPU device/context, layer textures, and compositing.
 *
 * Phase 3: WebGPU is the primary document renderer. All 12 blend modes are
 * supported via a custom blend-composite shader. Layer transforms (translate,
 * scale, rotation) are handled via an inverse affine matrix in the shader.
 * Device loss triggers automatic fallback to Canvas2D.
 *
 * Layer content is still authored on CPU Canvas2D. The runtime uploads dirty
 * layer canvases to GPU textures, then composites them on the GPU for display.
 *
 * Readback (flatten / mask export) goes through Canvas2DRuntime helpers.
 */

import type { SketchRuntime, ActiveStrokeInfo, DirtyRect, ResolvedLayerBitmap } from "./types";
import {
  getAncestorGroupOpacityProduct,
  isLayerCompositeVisible,
  type Layer,
  type LayerContentBounds,
  type Selection,
  type SketchDocument
} from "../types";
import { Canvas2DRuntime } from "./Canvas2DRuntime";
import { checkerboardDocumentCellPx } from "../drawingUtils";
import { getLayerCompositeOffset } from "../painting/layerBounds";
import { drawStrokeBufferForDisplayWithSelectionFeather } from "../selection";
import {
  FULLSCREEN_QUAD_VERTEX,
  CHECKERBOARD_FRAGMENT,
  LAYER_COMPOSITE_FRAGMENT,
  BLEND_COMPOSITE_FRAGMENT,
  BLIT_FRAGMENT,
  BORDER_FRAGMENT
} from "./shaders";

// ─── Blend mode ID mapping (must match shader switch cases) ──────────────

const BLEND_MODE_ID: Record<string, number> = {
  "normal": 0,
  "multiply": 1,
  "screen": 2,
  "overlay": 3,
  "darken": 4,
  "lighten": 5,
  "color-dodge": 6,
  "color-burn": 7,
  "hard-light": 8,
  "soft-light": 9,
  "difference": 10,
  "exclusion": 11
};

/** Hardware source-over blend for normal blend mode (fast path). */
const SOURCE_OVER_BLEND: GPUBlendState = {
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

// ─── Inverse affine matrix type ──────────────────────────────────────────

/** 2×3 affine matrix mapping screen pixels → layer texels. */
interface InverseAffine {
  a: number; b: number; tx: number;
  c: number; d: number; ty: number;
}

// ─── WebGPURuntime ───────────────────────────────────────────────────────

export class WebGPURuntime implements SketchRuntime {
  // ── GPU state ────────────────────────────────────────────────────────
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat;
  private targetCanvas: HTMLCanvasElement | null = null;
  /** Last size passed to `GPUCanvasContext.configure` for `targetCanvas` (must reconfigure when the element resizes). */
  private configuredCanvasPixelWidth = 0;
  private configuredCanvasPixelHeight = 0;

  // ── Pipelines ────────────────────────────────────────────────────────
  private checkerboardPipeline: GPURenderPipeline | null = null;
  private checkerboardBindGroupLayout: GPUBindGroupLayout | null = null;
  private layerPipeline: GPURenderPipeline | null = null;
  private layerBindGroupLayout: GPUBindGroupLayout | null = null;
  /** Pipeline for non-normal blend modes (shader-based compositing). */
  private blendPipeline: GPURenderPipeline | null = null;
  private blendBindGroupLayout: GPUBindGroupLayout | null = null;
  /** Pipeline for blitting composite texture → swap chain. */
  private blitPipeline: GPURenderPipeline | null = null;
  private blitBindGroupLayout: GPUBindGroupLayout | null = null;
  private borderPipeline: GPURenderPipeline | null = null;
  private borderBindGroupLayout: GPUBindGroupLayout | null = null;

  // ── Intermediate compositing textures (ping-pong pair) ─────────────
  /**
   * Two textures that alternate between "read" (source for blend shader)
   * and "write" (render target). After each layer, the roles swap.
   * This avoids reading and writing the same texture in one pass.
   */
  private pingPongA: GPUTexture | null = null;
  private pingPongB: GPUTexture | null = null;
  /** Cached size of the ping-pong textures. */
  private pingPongWidth = 0;
  private pingPongHeight = 0;

  // ── Layer textures ───────────────────────────────────────────────────
  private layerTextures = new Map<string, GPUTexture>();

  /** CPU merge (layer + stroke buffer) uploaded each frame while a buffered stroke is active. */
  private strokeMergeCpuCanvas: HTMLCanvasElement | null = null;
  private strokeMergeTexture: GPUTexture | null = null;
  private strokeMaskScratchCanvas: HTMLCanvasElement | null = null;

  // ── FX evaluation ────────────────────────────────────────────────────
  /** Temp canvas for FX-evaluated layer content (reused across layers within a frame). */
  private fxTempCanvas: HTMLCanvasElement | null = null;
  /** Temp GPU texture for uploading FX-evaluated layer content. */
  private fxTempTexture: GPUTexture | null = null;

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

  // ── Device loss ──────────────────────────────────────────────────────
  private _deviceLost = false;
  private _onDeviceLost?: () => void;

  constructor(
    device: GPUDevice,
    layerCanvases?: Map<string, HTMLCanvasElement>,
    onDeviceLost?: () => void
  ) {
    this.device = device;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.layerCanvases = layerCanvases ?? new Map();
    this.cpuRuntime = new Canvas2DRuntime(this.layerCanvases);
    this._onDeviceLost = onDeviceLost;

    // Register device loss handler
    device.lost.then((info) => {
      console.error("[WebGPU] Device lost:", info.message, info.reason);
      this._deviceLost = true;
      this._onDeviceLost?.();
    });

    this.initPipelines();
  }

  // ─── Pipeline initialization ─────────────────────────────────────────

  private initPipelines(): void {
    const device = this.device;

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

    // ── Layer composite (normal blend — hardware source-over) ──────────
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
            blend: SOURCE_OVER_BLEND
          }
        ]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // ── Blend composite (non-normal blend modes — shader compositing) ──
    const blendModule = device.createShaderModule({
      label: "blend-composite-frag",
      code: FULLSCREEN_QUAD_VERTEX + BLEND_COMPOSITE_FRAGMENT
    });

    this.blendBindGroupLayout = device.createBindGroupLayout({
      label: "blend-bgl",
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
          texture: { sampleType: "float" }
        }
      ]
    });

    this.blendPipeline = device.createRenderPipeline({
      label: "blend-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.blendBindGroupLayout]
      }),
      vertex: {
        module: blendModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: blendModule,
        entryPoint: "fs_blend",
        targets: [
          {
            // No hardware blending — shader handles full compositing
            format: this.presentationFormat
          }
        ]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // ── Blit (composite texture → swap chain) ──────────────────────────
    const blitModule = device.createShaderModule({
      label: "blit-frag",
      code: FULLSCREEN_QUAD_VERTEX + BLIT_FRAGMENT
    });

    this.blitBindGroupLayout = device.createBindGroupLayout({
      label: "blit-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });

    this.blitPipeline = device.createRenderPipeline({
      label: "blit-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.blitBindGroupLayout]
      }),
      vertex: {
        module: blitModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: blitModule,
        entryPoint: "fs_blit",
        targets: [{ format: this.presentationFormat }]
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
            blend: SOURCE_OVER_BLEND
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
    const w = canvas.width;
    const h = canvas.height;
    if (
      this.targetCanvas === canvas &&
      this.context &&
      w === this.configuredCanvasPixelWidth &&
      h === this.configuredCanvasPixelHeight
    ) {
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
    this.configuredCanvasPixelWidth = w;
    this.configuredCanvasPixelHeight = h;

    // Recreate intermediate compositing textures at the new size
    this.ensureCompositeTextures(w, h);
  }

  /**
   * Ensure ping-pong compositing textures exist at the given size.
   * Both textures need identical usages since they alternate roles.
   */
  private ensureCompositeTextures(width: number, height: number): void {
    if (
      this.pingPongA &&
      this.pingPongWidth === width &&
      this.pingPongHeight === height
    ) {
      return;
    }
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);

    // Destroy old textures
    this.pingPongA?.destroy();
    this.pingPongB?.destroy();

    const usage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST;

    this.pingPongA = this.device.createTexture({
      label: "ping-pong-A",
      size: { width: safeW, height: safeH },
      format: this.presentationFormat,
      usage
    });

    this.pingPongB = this.device.createTexture({
      label: "ping-pong-B",
      size: { width: safeW, height: safeH },
      format: this.presentationFormat,
      usage
    });

    this.pingPongWidth = width;
    this.pingPongHeight = height;
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
    this.strokeMaskScratchCanvas = drawStrokeBufferForDisplayWithSelectionFeather(
      sctx,
      stroke.buffer,
      stroke.selectionMaskForPreview,
      this.strokeMaskScratchCanvas
    );
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

  // ─── SketchRuntime: Compositing (ping-pong architecture) ──────────────
  //
  // Every layer is composited via a shader that reads both the current
  // composite ("read" texture) and the layer texture, applies the blend
  // mode formula, and writes the result to the "write" texture. After each
  // layer the two textures swap roles (ping-pong). This allows all 12
  // Photoshop-style blend modes without any texture copies.
  //
  // Flow:
  //   1. Draw checkerboard → pingPongA (becomes initial "read")
  //   2. For each layer: blend shader reads "read" + layer → writes "write", swap
  //   3. Draw border → current "read" (the final composite)
  //   4. Blit current "read" → swap chain

  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    _dirtyRect?: DirtyRect | null
  ): void {
    // Guard against device loss
    if (this._deviceLost) {
      return;
    }

    this.configureContext(targetCanvas);
    if (!this.context || !this.pingPongA || !this.pingPongB) {
      return;
    }

    this.syncLayerTextures();

    const device = this.device;
    const swapChainView = this.context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder({ label: "composite-frame" });

    const fullW = targetCanvas.width;
    const fullH = targetCanvas.height;

    // Ping-pong state: readTex is the current composite, writeTex is the target.
    let readTex = this.pingPongA;
    let writeTex = this.pingPongB;

    // ── Pass 1: Checkerboard → readTex ────────────────────────────────
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: readTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });

      if (this.checkerboardPipeline && this.checkerboardBindGroupLayout) {
        const effectiveCell = checkerboardDocumentCellPx(this.zoom);
        const uniformData = new Float32Array([
          fullW, fullH, effectiveCell, 0.0,
          0x2a / 255, 0x2a / 255, 0x2a / 255, 1.0,
          0x3a / 255, 0x3a / 255, 0x3a / 255, 1.0
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

    // ── Pass 2: Layer compositing (ping-pong) ─────────────────────────
    const mergeTex =
      activeStroke != null ? this.uploadStrokeMergePreview(activeStroke) : null;

    for (const layer of doc.layers) {
      if (layer.type === "mask" || layer.type === "group") {
        continue;
      }
      if (!isLayerCompositeVisible(doc.layers, layer, isolatedLayerId)) {
        continue;
      }
      if (isolatedLayerId && layer.id !== isolatedLayerId) {
        continue;
      }

      // Determine source texture (stroke merge preview, FX-evaluated, or raw layer)
      let srcTex = this.layerTextures.get(layer.id);
      if (!srcTex) {
        continue;
      }

      // Stroke merge preview overrides the layer texture for the active stroke layer
      if (mergeTex && activeStroke && layer.id === activeStroke.layerId) {
        srcTex = mergeTex;
      }

      // FX evaluation: if the layer has enabled effects, evaluate on CPU and upload
      if (layer.effects.length > 0 && layer.effects.some((e) => e.enabled)) {
        const cpuCanvas = this.layerCanvases.get(layer.id);
        if (cpuCanvas) {
          const resolved = this.cpuRuntime.evaluateLayerEffects(
            layer.id, cpuCanvas, layer.effects
          );
          if (resolved.surface !== cpuCanvas) {
            srcTex = this.uploadFxTempTexture(resolved.surface);
          }
        }
      }

      const opacityScale = getAncestorGroupOpacityProduct(
        doc.layers, layer, isolatedLayerId
      );
      const finalOpacity = layer.opacity * opacityScale;
      const blendModeId = BLEND_MODE_ID[layer.blendMode || "normal"] ?? 0;

      // Compute inverse affine transform: screen pixel → layer texel
      const invAffine = this.computeInverseAffine(layer, srcTex.width, srcTex.height);

      // Render blend pass: reads readTex (dst) + srcTex (layer) → writes writeTex
      this.renderBlendPass(
        encoder, readTex, writeTex, srcTex,
        finalOpacity, blendModeId, fullW, fullH, invAffine
      );

      // Swap ping-pong roles
      const tmp = readTex;
      readTex = writeTex;
      writeTex = tmp;
    }

    // ── Pass 3: Border → readTex (current composite) ──────────────────
    if (this.borderPipeline && this.borderBindGroupLayout) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: readTex.createView(),
            loadOp: "load",
            storeOp: "store"
          }
        ]
      });

      const borderData = new Float32Array([
        fullW, fullH, 1.0, 0.0,
        1.0, 1.0, 1.0, 0.25
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

    // ── Pass 4: Blit readTex → swap chain ─────────────────────────────
    if (this.blitPipeline && this.blitBindGroupLayout) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapChainView,
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });

      const bindGroup = device.createBindGroup({
        layout: this.blitBindGroupLayout,
        entries: [
          { binding: 0, resource: readTex.createView() }
        ]
      });

      pass.setPipeline(this.blitPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
  }

  // ─── Ping-pong blend pass ───────────────────────────────────────────

  /**
   * Render one layer blend pass. Reads `readTex` (current composite) and
   * `srcTex` (layer), writes the blended result to `writeTex`.
   * The shader writes every pixel (fullscreen quad), so loadOp is irrelevant.
   */
  private renderBlendPass(
    encoder: GPUCommandEncoder,
    readTex: GPUTexture,
    writeTex: GPUTexture,
    srcTex: GPUTexture,
    opacity: number,
    blendModeId: number,
    canvasW: number,
    canvasH: number,
    invAffine: InverseAffine
  ): void {
    if (!this.blendPipeline || !this.blendBindGroupLayout) {
      return;
    }

    // Uniforms: params0 + invRow0 + invRow1 = 3 × vec4f = 48 bytes
    const uniformData = new Float32Array([
      opacity, blendModeId, canvasW, canvasH,
      invAffine.a, invAffine.b, invAffine.tx, 0.0,
      invAffine.c, invAffine.d, invAffine.ty, 0.0
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.blendBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: srcTex.createView() },
        { binding: 2, resource: readTex.createView() }
      ]
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: writeTex.createView(),
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    pass.setPipeline(this.blendPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  // ─── Inverse affine transform computation ───────────────────────────

  /**
   * Compute the inverse affine matrix that maps screen pixels → layer texels.
   *
   * Forward transform (texel → screen):
   *   1. Center texel at origin: p - (texW/2, texH/2)
   *   2. Scale: × (scaleX, scaleY)
   *   3. Rotate: × R(rotation)
   *   4. Translate to screen: + compositeCenter
   *
   * This method returns the inverse of that transform.
   */
  private computeInverseAffine(
    layer: Pick<Layer, "transform" | "contentBounds">,
    texW: number,
    texH: number
  ): InverseAffine {
    const compositeOffset = getLayerCompositeOffset(
      layer,
      { width: texW, height: texH },
      this.layerCanvases.get((layer as Layer).id)
    );

    const sx = layer.transform?.scaleX ?? 1;
    const sy = layer.transform?.scaleY ?? 1;
    const rot = layer.transform?.rotation ?? 0;
    const matrix = layer.transform?.matrix;
    const usesAdvancedAffine = Boolean(matrix && layer.transform?.mode);
    const rasterOriginX = compositeOffset.x - (layer.transform?.x ?? 0);
    const rasterOriginY = compositeOffset.y - (layer.transform?.y ?? 0);

    if (usesAdvancedAffine && matrix) {
      const [a, b, c, d, e, f] = matrix;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-12) {
        return {
          a: 1, b: 0, tx: -compositeOffset.x,
          c: 0, d: 1, ty: -compositeOffset.y
        };
      }
      const invDet = 1 / det;
      const ia = d * invDet;
      const ib = -b * invDet;
      const ic = -c * invDet;
      const id = a * invDet;
      const ie = (c * f - d * e) * invDet;
      const iff = (b * e - a * f) * invDet;
      return {
        a: ia,
        b: ic,
        tx: ie - rasterOriginX,
        c: ib,
        d: id,
        ty: iff - rasterOriginY
      };
    }

    // For no transform, return simple translation
    if (sx === 1 && sy === 1 && rot === 0) {
      return {
        a: 1, b: 0, tx: -compositeOffset.x,
        c: 0, d: 1, ty: -compositeOffset.y
      };
    }

    // Center of the layer in screen space
    const csx = compositeOffset.x + texW / 2;
    const csy = compositeOffset.y + texH / 2;

    // Inverse rotation + scale: S^-1 × R^-1
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const a = cosR / sx;
    const b = sinR / sx;
    const c = -sinR / sy;
    const d = cosR / sy;

    return {
      a, b,
      tx: -a * csx - b * csy + texW / 2,
      c, d,
      ty: -c * csx - d * csy + texH / 2
    };
  }

  /**
   * Upload an FX-evaluated canvas to a temporary GPU texture for compositing.
   * Reuses the texture across layers within the same frame.
   */
  private uploadFxTempTexture(canvas: HTMLCanvasElement): GPUTexture {
    const w = canvas.width;
    const h = canvas.height;
    if (
      !this.fxTempTexture ||
      this.fxTempTexture.width !== w ||
      this.fxTempTexture.height !== h
    ) {
      this.fxTempTexture?.destroy();
      this.fxTempTexture = this.device.createTexture({
        label: "fx-temp",
        size: { width: Math.max(1, w), height: Math.max(1, h) },
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
    }
    if (canvas.getContext("2d")) {
      this.device.queue.copyExternalImageToTexture(
        { source: canvas, flipY: false },
        { texture: this.fxTempTexture },
        { width: w, height: h }
      );
    }
    return this.fxTempTexture;
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

  invertLayerColors(doc: SketchDocument, selection?: { width: number; height: number; data: Uint8ClampedArray; originX?: number; originY?: number } | null): void {
    this.cpuRuntime.invertLayerColors(doc, selection);
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

  // ─── Effects evaluation ──────────────────────────────────────────────

  evaluateLayerEffects(
    layerId: string,
    source: HTMLCanvasElement,
    effects: import("../types").LayerEffect[]
  ): ResolvedLayerBitmap {
    // Delegate to the CPU runtime; WebGPU-accelerated effects will be added later.
    // When GPU-backed effects are implemented, this method will evaluate them
    // directly on the GPU and may return linear-srgb or HDR results.
    return this.cpuRuntime.evaluateLayerEffects(layerId, source, effects);
  }

  getResolvedLayerOutput(
    doc: import("../types").SketchDocument,
    layerId: string
  ): ResolvedLayerBitmap | null {
    return this.cpuRuntime.getResolvedLayerOutput(doc, layerId);
  }

  // ─── Composite readback ─────────────────────────────────────────────

  readbackComposite(
    doc: import("../types").SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null
  ): ImageData | null {
    // Delegate to the CPU runtime which shares the same layer canvas map.
    // This produces pixel-accurate results with effects applied.
    return this.cpuRuntime.readbackComposite(doc, isolatedLayerId, activeStroke);
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
    this.strokeMaskScratchCanvas = null;
    this.pingPongA?.destroy();
    this.pingPongA = null;
    this.pingPongB?.destroy();
    this.pingPongB = null;
    this.fxTempTexture?.destroy();
    this.fxTempTexture = null;
    this.fxTempCanvas = null;
    this.cpuRuntime.dispose();
    this.dirtyLayers.clear();
    this.context = null;
    this.targetCanvas = null;
  }
}

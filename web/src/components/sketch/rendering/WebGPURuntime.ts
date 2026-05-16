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
import { getLayerGeometry } from "../transform/geometry/layerGeometry";
import { drawImageToQuad } from "./canvas2d/quadTransform";
import {
  combineMasks,
  trimSelectionMask,
  type SelectionCombineOp
} from "../selection";
import {
  FULLSCREEN_QUAD_VERTEX,
  CHECKERBOARD_FRAGMENT,
  LAYER_COMPOSITE_FRAGMENT,
  BLEND_COMPOSITE_FRAGMENT,
  BLIT_FRAGMENT,
  SELECTION_ANTS_FRAGMENT,
  MASK_BLUR_FRAGMENT
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
  private selectionAntsCanvas: HTMLCanvasElement | null = null;
  private selectionAntsContext: GPUCanvasContext | null = null;
  private configuredSelectionAntsPixelWidth = 0;
  private configuredSelectionAntsPixelHeight = 0;
  private selectionAntsViewportWidthCss = 0;
  private selectionAntsViewportHeightCss = 0;
  private selectionAntsPanXCss = 0;
  private selectionAntsPanYCss = 0;
  private selectionAntsMarginCss = 0;
  private selectionAntsDpr = 1;

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
  private selectionAntsPipeline: GPURenderPipeline | null = null;
  private selectionMaskOverlayPipeline: GPURenderPipeline | null = null;
  private selectionAntsBindGroupLayout: GPUBindGroupLayout | null = null;
  /** Which selection visualization to render in pass 4. Driven by store state. */
  private selectionPreviewMode: "ants" | "mask" = "ants";

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

  // ── Selection mask texture ────────────────────────────────────────────
  /** GPU r8unorm texture derived from Selection.data. Recreated on dimension change. */
  private maskTexture: GPUTexture | null = null;
  /** True when maskTexture is stale and needs re-upload before next composite. */
  private maskDirty = false;
  /** Last selection passed to setSelection — canonical CPU source for the mask. */
  private currentSelection: Selection | null = null;

  // ── Selection mask refine (GPU feather / expand / contract / smooth) ──
  /** Pipelines for separable mask blur (used as building block by feather). */
  private maskBlurPipelineH: GPURenderPipeline | null = null;
  private maskBlurPipelineV: GPURenderPipeline | null = null;
  /** Pipelines for separable morphological dilate (expand) and erode (contract). */
  private maskDilatePipelineH: GPURenderPipeline | null = null;
  private maskDilatePipelineV: GPURenderPipeline | null = null;
  private maskErodePipelineH: GPURenderPipeline | null = null;
  private maskErodePipelineV: GPURenderPipeline | null = null;
  private maskBlurBindGroupLayout: GPUBindGroupLayout | null = null;
  /** Sampler used by the blur pipelines (linear, clamp-to-edge). */
  private maskBlurSampler: GPUSampler | null = null;
  /**
   * Scratch r8unorm texture used as the intermediate target between H and V
   * passes (and as ping-pong half-step for multi-pass smoothing). Resized to
   * match the current mask texture dimensions on demand.
   */
  private maskScratchTexture: GPUTexture | null = null;
  private maskScratchWidth = 0;
  private maskScratchHeight = 0;
  /** Mappable buffer reused across refine ops to read the mask back to CPU. */
  private maskReadbackBuffer: GPUBuffer | null = null;
  private maskReadbackBufferSize = 0;
  /** Per-op uniform buffer (16 bytes — single vec4f). */
  private maskBlurUniformBuffer: GPUBuffer | null = null;

  // ── FX evaluation ────────────────────────────────────────────────────
  /** Temp canvas for FX-evaluated layer content (reused across layers within a frame). */
  private fxTempCanvas: HTMLCanvasElement | null = null;
  /** Temp GPU texture for uploading FX-evaluated layer content. */
  private fxTempTexture: GPUTexture | null = null;

  // ── Quad transform pre-rasterization ────────────────────────────────
  /**
   * Per-layer doc-sized CPU canvases for layers whose transform is `quad`.
   * The Canvas2D path is the authoritative quad renderer
   * (`drawImageToQuad`), so we bake the layer canvas onto a doc-sized
   * surface with that helper, then upload it as an identity-positioned
   * texture for the GPU composite. Cached per-layer because two quad
   * layers can co-exist in one frame and overwriting a shared texture
   * across draws within the same submission has undefined ordering.
   */
  private quadBakeCanvases = new Map<string, HTMLCanvasElement>();
  private quadBakeTextures = new Map<string, GPUTexture>();

  // ── CPU-side fallback for readback & layer pixel ops ─────────────────
  private cpuRuntime: Canvas2DRuntime;
  private layerCanvases: Map<string, HTMLCanvasElement>;

  /**
   * Current zoom level – used to scale the checkerboard cell so
   * the visual size stays constant on screen.
   */
  zoom = 1;

  /** Called after compositing when the runtime needs continuous redraws (ants animation). */
  onNeedsRedraw?: () => void;
  /** Overrides currentSelection.originX/Y during a live move-drag, without committing to the store. */
  private selectionOriginOverride: { x: number; y: number } | null = null;

  setSelectionOriginOverride(pos: { x: number; y: number } | null): void {
    this.selectionOriginOverride = pos;
  }

  setSelectionPreviewMode(mode: "ants" | "mask"): void {
    this.selectionPreviewMode = mode;
  }

  setSelectionAntsOverlayCanvas(canvas: HTMLCanvasElement | null): void {
    if (this.selectionAntsCanvas !== canvas) {
      this.selectionAntsContext = null;
      this.configuredSelectionAntsPixelWidth = 0;
      this.configuredSelectionAntsPixelHeight = 0;
    }
    this.selectionAntsCanvas = canvas;
    if (canvas === null) {
      this.selectionAntsContext = null;
      this.configuredSelectionAntsPixelWidth = 0;
      this.configuredSelectionAntsPixelHeight = 0;
    }
  }

  setSelectionAntsViewport(params: {
    viewportWidthCss: number;
    viewportHeightCss: number;
    panXCss: number;
    panYCss: number;
    marginCss: number;
    dpr: number;
  }): void {
    this.selectionAntsViewportWidthCss = params.viewportWidthCss;
    this.selectionAntsViewportHeightCss = params.viewportHeightCss;
    this.selectionAntsPanXCss = params.panXCss;
    this.selectionAntsPanYCss = params.panYCss;
    this.selectionAntsMarginCss = params.marginCss;
    this.selectionAntsDpr = params.dpr;
  }

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

    // ── Selection marching ants ────────────────────────────────────────
    const antsModule = device.createShaderModule({
      label: "ants-frag",
      code: FULLSCREEN_QUAD_VERTEX + SELECTION_ANTS_FRAGMENT
    });

    this.selectionAntsBindGroupLayout = device.createBindGroupLayout({
      label: "ants-bgl",
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

    const antsPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.selectionAntsBindGroupLayout]
    });

    this.selectionAntsPipeline = device.createRenderPipeline({
      label: "ants-pipeline",
      layout: antsPipelineLayout,
      vertex: {
        module: antsModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: antsModule,
        entryPoint: "fs_ants",
        targets: [
          {
            format: this.presentationFormat,
            blend: SOURCE_OVER_BLEND
          }
        ]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // Parallel pipeline rendering the mask as a red rubylith overlay. Shares
    // the ants module + bind group layout; only the fragment entry differs.
    this.selectionMaskOverlayPipeline = device.createRenderPipeline({
      label: "mask-overlay-pipeline",
      layout: antsPipelineLayout,
      vertex: {
        module: antsModule,
        entryPoint: "vs_main"
      },
      fragment: {
        module: antsModule,
        entryPoint: "fs_mask_overlay",
        targets: [
          {
            format: this.presentationFormat,
            blend: SOURCE_OVER_BLEND
          }
        ]
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // ── Mask refine: separable box blur (feather / smooth building block) ─
    const maskBlurModule = device.createShaderModule({
      label: "mask-blur-frag",
      code: FULLSCREEN_QUAD_VERTEX + MASK_BLUR_FRAGMENT
    });

    this.maskBlurBindGroupLayout = device.createBindGroupLayout({
      label: "mask-blur-bgl",
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

    const maskBlurPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.maskBlurBindGroupLayout]
    });

    // Both passes target r8unorm with no blend (overwrite output).
    const maskBlurTargets: GPUColorTargetState[] = [{ format: "r8unorm" }];

    this.maskBlurPipelineH = device.createRenderPipeline({
      label: "mask-blur-h-pipeline",
      layout: maskBlurPipelineLayout,
      vertex: { module: maskBlurModule, entryPoint: "vs_main" },
      fragment: {
        module: maskBlurModule,
        entryPoint: "fs_mask_blur_h",
        targets: maskBlurTargets
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    this.maskBlurPipelineV = device.createRenderPipeline({
      label: "mask-blur-v-pipeline",
      layout: maskBlurPipelineLayout,
      vertex: { module: maskBlurModule, entryPoint: "vs_main" },
      fragment: {
        module: maskBlurModule,
        entryPoint: "fs_mask_blur_v",
        targets: maskBlurTargets
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
    });

    // Dilate/erode share the same module + bind group layout as blur (they
    // ignore the sampler binding and use textureLoad for exact integer
    // coordinate reads — linear filtering is not meaningful for non-linear
    // reductions like max/min).
    const mkRefinePipeline = (
      label: string,
      entryPoint: string
    ): GPURenderPipeline =>
      device.createRenderPipeline({
        label,
        layout: maskBlurPipelineLayout,
        vertex: { module: maskBlurModule, entryPoint: "vs_main" },
        fragment: { module: maskBlurModule, entryPoint, targets: maskBlurTargets },
        primitive: { topology: "triangle-strip", stripIndexFormat: undefined }
      });

    this.maskDilatePipelineH = mkRefinePipeline("mask-dilate-h-pipeline", "fs_mask_dilate_h");
    this.maskDilatePipelineV = mkRefinePipeline("mask-dilate-v-pipeline", "fs_mask_dilate_v");
    this.maskErodePipelineH = mkRefinePipeline("mask-erode-h-pipeline", "fs_mask_erode_h");
    this.maskErodePipelineV = mkRefinePipeline("mask-erode-v-pipeline", "fs_mask_erode_v");

    this.maskBlurSampler = device.createSampler({
      label: "mask-blur-sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    this.maskBlurUniformBuffer = device.createBuffer({
      label: "mask-blur-uniforms",
      size: 16, // single vec4f
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
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

  private configureSelectionAntsContext(): GPUTextureView | null {
    const canvas = this.selectionAntsCanvas;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return null;
    }
    const w = canvas.width;
    const h = canvas.height;
    if (
      this.selectionAntsCanvas === canvas &&
      this.selectionAntsContext &&
      w === this.configuredSelectionAntsPixelWidth &&
      h === this.configuredSelectionAntsPixelHeight
    ) {
      return this.selectionAntsContext.getCurrentTexture().createView();
    }
    const ctx = canvas.getContext("webgpu");
    if (!ctx) {
      throw new Error("Failed to get WebGPU context from selection ants canvas");
    }
    this.selectionAntsContext = ctx;
    ctx.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: "premultiplied"
    });
    this.configuredSelectionAntsPixelWidth = w;
    this.configuredSelectionAntsPixelHeight = h;
    return ctx.getCurrentTexture().createView();
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

  // ─── Selection mask texture ──────────────────────────────────────────

  setSelection(sel: Selection | null): void {
    const prev = this.currentSelection;
    this.currentSelection = sel;
    if (sel?.data !== prev?.data) {
      if (sel !== null) {
        this.maskDirty = true;
      } else {
        this.maskTexture?.destroy();
        this.maskTexture = null;
        this.maskDirty = false;
      }
    }
  }

  applySelectionOverlay(
    overlay: Selection,
    op: SelectionCombineOp
  ): Selection | null {
    const normalizedOverlay = trimSelectionMask(overlay);
    if (!normalizedOverlay) {
      return this.currentSelection;
    }
    const base = op === "replace" ? null : this.currentSelection;
    const nextSelection = trimSelectionMask(combineMasks(base, normalizedOverlay, op));
    this.setSelection(nextSelection);
    return nextSelection;
  }

  private uploadMaskTexture(): void {
    const sel = this.currentSelection;
    if (!sel || sel.width <= 0 || sel.height <= 0) {
      return;
    }
    const { width, height, data } = sel;

    if (
      !this.maskTexture ||
      this.maskTexture.width !== width ||
      this.maskTexture.height !== height
    ) {
      this.maskTexture?.destroy();
      this.maskTexture = this.device.createTexture({
        label: "selection-mask",
        size: { width: Math.max(1, width), height: Math.max(1, height) },
        format: "r8unorm",
        // RENDER_ATTACHMENT: used as the V-pass output target during GPU
        // refine ops (feather/expand/contract/smooth).
        // COPY_SRC: needed for the post-op readback to a mappable buffer
        // that updates the CPU-side Selection.data.
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC
      });
    }

    // writeTexture requires bytesPerRow to be a multiple of 256.
    const alignedBytesPerRow = Math.ceil(width / 256) * 256;
    const u8Data = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
    if (alignedBytesPerRow === width) {
      this.device.queue.writeTexture(
        { texture: this.maskTexture },
        u8Data,
        { bytesPerRow: width, rowsPerImage: height },
        { width, height }
      );
    } else {
      const padded = new Uint8Array(alignedBytesPerRow * height);
      for (let row = 0; row < height; row++) {
        padded.set(
          data.subarray(row * width, (row + 1) * width),
          row * alignedBytesPerRow
        );
      }
      this.device.queue.writeTexture(
        { texture: this.maskTexture },
        padded,
        { bytesPerRow: alignedBytesPerRow, rowsPerImage: height },
        { width, height }
      );
    }

    this.maskDirty = false;
  }

  // ─── Selection mask refine (GPU) ─────────────────────────────────────

  /**
   * (Re)create the scratch mask texture at the given dimensions. Used as the
   * intermediate target between H and V blur passes. Lazy + size-cached so
   * repeated refine ops on the same selection reuse the same allocation.
   */
  private ensureMaskScratchTexture(width: number, height: number): GPUTexture {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (
      this.maskScratchTexture &&
      this.maskScratchWidth === w &&
      this.maskScratchHeight === h
    ) {
      return this.maskScratchTexture;
    }
    this.maskScratchTexture?.destroy();
    this.maskScratchTexture = this.device.createTexture({
      label: "mask-scratch",
      size: { width: w, height: h },
      format: "r8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.maskScratchWidth = w;
    this.maskScratchHeight = h;
    return this.maskScratchTexture;
  }

  /**
   * (Re)create the mappable readback buffer. Grows only — refine ops on
   * smaller selections reuse a larger buffer rather than reallocating.
   */
  private ensureMaskReadbackBuffer(byteSize: number): GPUBuffer {
    const size = Math.max(16, byteSize);
    if (this.maskReadbackBuffer && this.maskReadbackBufferSize >= size) {
      return this.maskReadbackBuffer;
    }
    this.maskReadbackBuffer?.destroy();
    this.maskReadbackBuffer = this.device.createBuffer({
      label: "mask-readback",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    this.maskReadbackBufferSize = size;
    return this.maskReadbackBuffer;
  }

  /**
   * Encode a single mask-refine pass (blur / dilate / erode, H or V) reading
   * `source` and writing `target`. Caller selects the pipeline + ping-pong
   * direction; both textures must be r8unorm with matching dimensions.
   */
  private encodeMaskRefinePass(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    label: string,
    source: GPUTexture,
    target: GPUTexture,
    radiusPx: number,
    width: number,
    height: number
  ): void {
    if (
      !this.maskBlurBindGroupLayout ||
      !this.maskBlurSampler ||
      !this.maskBlurUniformBuffer
    ) {
      return;
    }
    // Upload per-pass uniforms (radius + 1/dim texel step in UV units).
    const uniformData = new Float32Array([
      Math.max(0, Math.floor(radiusPx)),
      1 / Math.max(1, width),
      1 / Math.max(1, height),
      0
    ]);
    this.device.queue.writeBuffer(
      this.maskBlurUniformBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength
    );

    const bindGroup = this.device.createBindGroup({
      label: `${label}-bg`,
      layout: this.maskBlurBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.maskBlurUniformBuffer } },
        { binding: 1, resource: source.createView() },
        { binding: 2, resource: this.maskBlurSampler }
      ]
    });

    const pass = encoder.beginRenderPass({
      label: `${label}-pass`,
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  /**
   * Copy the mask texture into the readback buffer, await mapAsync, and
   * unpack the (possibly row-padded) bytes into a fresh `Uint8ClampedArray`
   * of size `width * height`.
   */
  private async readMaskTextureToCpu(
    source: GPUTexture,
    width: number,
    height: number
  ): Promise<Uint8ClampedArray> {
    // copyTextureToBuffer requires bytesPerRow to be a multiple of 256.
    const alignedBytesPerRow = Math.ceil(width / 256) * 256;
    const totalBytes = alignedBytesPerRow * height;
    const buffer = this.ensureMaskReadbackBuffer(totalBytes);

    const encoder = this.device.createCommandEncoder({ label: "mask-readback" });
    encoder.copyTextureToBuffer(
      { texture: source },
      {
        buffer,
        bytesPerRow: alignedBytesPerRow,
        rowsPerImage: height
      },
      { width, height }
    );
    this.device.queue.submit([encoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ, 0, totalBytes);
    const padded = new Uint8Array(buffer.getMappedRange(0, totalBytes));
    const out = new Uint8ClampedArray(width * height);
    if (alignedBytesPerRow === width) {
      out.set(padded.subarray(0, width * height));
    } else {
      for (let y = 0; y < height; y++) {
        const srcStart = y * alignedBytesPerRow;
        out.set(padded.subarray(srcStart, srcStart + width), y * width);
      }
    }
    buffer.unmap();
    return out;
  }

  /**
   * GPU feather: apply 3 separable box-blur passes (≈ Gaussian) to the
   * current selection mask in-place on the GPU, then read back to CPU.
   * Returns a fresh Selection with updated `.data` (same dims and origin),
   * or `null` if no selection / device unavailable / radius ≤ 0.
   *
   * The caller is expected to feed the result back through
   * `setSelectionAfterGpuOp` + the store so the next composite reuses the
   * GPU-resident mask without re-uploading from CPU.
   */
  async featherSelectionGpu(radius: number): Promise<Selection | null> {
    if (this._deviceLost) {
      return null;
    }
    const sel = this.currentSelection;
    if (!sel || sel.width <= 0 || sel.height <= 0) {
      return null;
    }
    if (
      !this.maskBlurPipelineH ||
      !this.maskBlurPipelineV ||
      !this.maskBlurBindGroupLayout
    ) {
      return null;
    }
    const r = Math.max(0, Math.floor(radius));
    if (r <= 0) {
      // Caller asked for no-op; return a clone so identity is preserved.
      return {
        width: sel.width,
        height: sel.height,
        data: new Uint8ClampedArray(sel.data),
        originX: sel.originX,
        originY: sel.originY
      };
    }
    // Match CPU `featherMaskAlpha`: 3 box-blur passes with radius ≈ r/2.
    const perPassRadius = Math.max(1, Math.round(r / 2));

    // Ensure mask is on the GPU and current.
    if (this.maskDirty || !this.maskTexture) {
      this.uploadMaskTexture();
    }
    const maskTex = this.maskTexture;
    if (!maskTex) {
      return null;
    }
    const { width, height } = sel;
    const scratch = this.ensureMaskScratchTexture(width, height);

    // Encode 3 ×{H,V} passes into a single submission.
    const encoder = this.device.createCommandEncoder({ label: "mask-feather" });
    for (let pass = 0; pass < 3; pass++) {
      this.encodeMaskRefinePass(
        encoder, this.maskBlurPipelineH, "mask-blur-h",
        maskTex, scratch, perPassRadius, width, height
      );
      this.encodeMaskRefinePass(
        encoder, this.maskBlurPipelineV, "mask-blur-v",
        scratch, maskTex, perPassRadius, width, height
      );
    }
    this.device.queue.submit([encoder.finish()]);

    const data = await this.readMaskTextureToCpu(maskTex, width, height);
    return {
      width,
      height,
      data,
      originX: sel.originX,
      originY: sel.originY
    };
  }

  /**
   * Shared driver for the single-radius separable refine ops (dilate / erode).
   * Encodes one H+V pass into the scratch ↔ mask ping-pong, then reads back.
   * `pipelineH` / `pipelineV` are required (returns `null` if either is
   * unavailable).
   */
  private async runMaskRefineSinglePass(
    pipelineH: GPURenderPipeline | null,
    pipelineV: GPURenderPipeline | null,
    label: string,
    radius: number
  ): Promise<Selection | null> {
    if (this._deviceLost) {
      return null;
    }
    const sel = this.currentSelection;
    if (!sel || sel.width <= 0 || sel.height <= 0) {
      return null;
    }
    if (!pipelineH || !pipelineV) {
      return null;
    }
    const r = Math.max(0, Math.floor(radius));
    if (r <= 0) {
      return {
        width: sel.width,
        height: sel.height,
        data: new Uint8ClampedArray(sel.data),
        originX: sel.originX,
        originY: sel.originY
      };
    }
    if (this.maskDirty || !this.maskTexture) {
      this.uploadMaskTexture();
    }
    const maskTex = this.maskTexture;
    if (!maskTex) {
      return null;
    }
    const { width, height } = sel;
    const scratch = this.ensureMaskScratchTexture(width, height);

    const encoder = this.device.createCommandEncoder({ label: `mask-${label}` });
    this.encodeMaskRefinePass(
      encoder, pipelineH, `${label}-h`, maskTex, scratch, r, width, height
    );
    this.encodeMaskRefinePass(
      encoder, pipelineV, `${label}-v`, scratch, maskTex, r, width, height
    );
    this.device.queue.submit([encoder.finish()]);

    const data = await this.readMaskTextureToCpu(maskTex, width, height);
    return {
      width,
      height,
      data,
      originX: sel.originX,
      originY: sel.originY
    };
  }

  /**
   * GPU expand: dilate the current selection mask by `radius` pixels using
   * a separable (2r+1)-tap max filter on each axis. Returns a fresh
   * Selection or `null` if the runtime cannot service the request.
   */
  async expandSelectionGpu(radius: number): Promise<Selection | null> {
    return this.runMaskRefineSinglePass(
      this.maskDilatePipelineH,
      this.maskDilatePipelineV,
      "dilate",
      radius
    );
  }

  /**
   * GPU contract: erode the current selection mask by `radius` pixels using
   * a separable (2r+1)-tap min filter on each axis. Returns a fresh
   * Selection or `null` if the runtime cannot service the request.
   */
  async contractSelectionGpu(radius: number): Promise<Selection | null> {
    return this.runMaskRefineSinglePass(
      this.maskErodePipelineH,
      this.maskErodePipelineV,
      "erode",
      radius
    );
  }

  /**
   * GPU smooth: feather the mask, then threshold every byte at 128 to
   * snap soft edges back to a hard 0/255 mask. Matches the CPU
   * `smoothSelectionBorders` semantics (feather radius is clamped to
   * [1, 8]). The threshold runs on CPU after readback — a tiny tight
   * loop on the same buffer the readback already owns — rather than
   * spending another shader pass + readback round-trip.
   */
  async smoothSelectionGpu(strength: number): Promise<Selection | null> {
    const s = Math.max(1, Math.min(8, Math.round(strength)));
    const feathered = await this.featherSelectionGpu(s);
    if (!feathered) {
      return null;
    }
    const out = feathered.data;
    for (let i = 0; i < out.length; i++) {
      out[i] = out[i] >= 128 ? 255 : 0;
    }
    return feathered;
  }

  /**
   * Adopt a CPU Selection returned by a GPU refine op without invalidating
   * the GPU-resident mask. The next compositing pass should NOT re-upload
   * (since the mask texture already holds the post-op pixels). Callers must
   * still update the store with the same Selection reference so React state
   * sees the change; the subsequent `setSelection` becomes a no-op because
   * `prev.data === sel.data` will hold.
   */
  setSelectionAfterGpuOp(sel: Selection | null): void {
    this.currentSelection = sel;
    this.maskDirty = false;
  }

  private drawSelectionAnts(
    encoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    docCanvasW: number,
    docCanvasH: number
  ): void {
    const pipeline =
      this.selectionPreviewMode === "mask"
        ? this.selectionMaskOverlayPipeline
        : this.selectionAntsPipeline;
    if (
      !pipeline ||
      !this.selectionAntsBindGroupLayout ||
      !this.maskTexture ||
      !this.currentSelection
    ) {
      return;
    }
    const sel = this.currentSelection;
    const originX = this.selectionOriginOverride?.x ?? sel.originX ?? 0;
    const originY = this.selectionOriginOverride?.y ?? sel.originY ?? 0;
    const canvasPhase = (performance.now() * 0.018) % 256;
    const uniformData = new Float32Array([
      docCanvasW, docCanvasH,
      originX, originY,
      sel.width, sel.height,
      this.selectionAntsViewportWidthCss * this.selectionAntsDpr,
      this.selectionAntsViewportHeightCss * this.selectionAntsDpr,
      this.selectionAntsMarginCss * this.selectionAntsDpr,
      this.selectionAntsMarginCss * this.selectionAntsDpr,
      this.selectionAntsPanXCss * this.selectionAntsDpr,
      this.selectionAntsPanYCss * this.selectionAntsDpr,
      canvasPhase, this.zoom, this.selectionAntsDpr, 0
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.selectionAntsBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: this.maskTexture.createView() }
      ]
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
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
    // Release any pre-baked quad transform texture / canvas for this layer.
    this.quadBakeTextures.get(layerId)?.destroy();
    this.quadBakeTextures.delete(layerId);
    this.quadBakeCanvases.delete(layerId);
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

  // ─── SketchRuntime: Compositing (ping-pong architecture) ──────────────
  //
  // Every layer is composited via a shader that reads both the current
  // composite ("read" texture) and the layer texture, applies the blend
  // mode formula, and writes the result to the "write" texture. After each
  // layer the two textures swap roles (ping-pong). This allows all 12
  // Standard blend modes without any texture copies.
  //
  // Flow:
  //   1. Draw checkerboard → pingPongA (becomes initial "read")
  //   2. For each layer: blend shader reads "read" + layer → writes "write", swap
  //   3. Blit current "read" → swap chain

  compositeToDisplay(
    targetCanvas: HTMLCanvasElement,
    doc: SketchDocument,
    isolatedLayerId: string | null | undefined,
    activeStroke: ActiveStrokeInfo | null,
    _dirtyRect?: DirtyRect | null,
    viewportZoom?: number
  ): void {
    // Guard against device loss
    if (this._deviceLost) {
      return;
    }

    if (
      viewportZoom != null &&
      Number.isFinite(viewportZoom) &&
      viewportZoom > 0
    ) {
      this.zoom = viewportZoom;
    }

    this.configureContext(targetCanvas);
    if (!this.context || !this.pingPongA || !this.pingPongB) {
      return;
    }

    this.syncLayerTextures();

    if (this.maskDirty) {
      this.uploadMaskTexture();
    }

    const device = this.device;
    const swapChainView = this.context.getCurrentTexture().createView();
    const selectionAntsView = this.configureSelectionAntsContext();
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
      if (layer.type === "group") {
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

      // Resolve the source CPU canvas after FX evaluation. The quad
      // pre-rasterization path needs the FX-evaluated bitmap as its source,
      // not the raw layer canvas, so we compute it once and share with the
      // GPU FX upload below.
      const rawCanvas = this.layerCanvases.get(layer.id) ?? null;
      const fxActive =
        rawCanvas != null &&
        layer.effects.length > 0 &&
        layer.effects.some((e) => e.enabled);
      const fxSurface = fxActive
        ? this.cpuRuntime.evaluateLayerEffects(layer.id, rawCanvas!, layer.effects).surface
        : rawCanvas;

      // FX evaluation: if FX produced a different surface, upload it.
      if (fxActive && fxSurface && fxSurface !== rawCanvas) {
        srcTex = this.uploadFxTempTexture(fxSurface);
      }

      const opacityScale = getAncestorGroupOpacityProduct(
        doc.layers, layer, isolatedLayerId
      );
      const finalOpacity = layer.opacity * opacityScale;
      const blendModeId = BLEND_MODE_ID[layer.blendMode || "normal"] ?? 0;

      // Compute inverse affine transform: screen pixel → layer texel.
      // Quad transforms aren't affine, so the shader can't sample them
      // directly. Pre-rasterize the (FX-evaluated) layer canvas through
      // Canvas2D's projective `drawImageToQuad` onto a doc-sized surface and
      // composite it with identity affine.
      let invAffine: InverseAffine;
      if (layer.transform.kind === "affine") {
        invAffine = this.computeInverseAffine(layer, srcTex.width, srcTex.height);
      } else {
        const baked = fxSurface
          ? this.bakeQuadLayerToDocCanvas(
              layer.id,
              layer.transform,
              fxSurface,
              fullW,
              fullH
            )
          : null;
        if (baked) {
          srcTex = this.uploadQuadBakeTexture(layer.id, baked);
          // Doc-sized texture, top-left at (0,0): inverse affine is identity.
          invAffine = { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 };
        } else {
          invAffine = this.computeInverseAffine(layer, srcTex.width, srcTex.height);
        }
      }

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

    // ── Pass 3: Blit readTex → swap chain ─────────────────────────────
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

    // Pass 4: marching ants overlay (fullscreen, samples GPU mask texture).
    let selectionAntsActive = false;
    if (
      selectionAntsView &&
      this.maskTexture &&
      this.currentSelection &&
      this.selectionAntsPipeline
    ) {
      this.drawSelectionAnts(
        encoder,
        selectionAntsView,
        doc.canvas.width,
        doc.canvas.height
      );
      selectionAntsActive = true;
    } else if (selectionAntsView) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: selectionAntsView,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
    // Ants animate; the mask overlay is static — only request continuous
    // redraws while drawing animated ants.
    if (selectionAntsActive && this.selectionPreviewMode === "ants") {
      this.onNeedsRedraw?.();
    }
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
    const compositeOffset = getLayerGeometry(
      layer,
      this.layerCanvases.get((layer as Layer).id),
      { width: texW, height: texH }
    ).compositeOffset;

    const t = layer.transform;
    // Quad transforms are baked to a doc-sized texture upstream
    // (see `bakeQuadLayerToDocCanvas`), so by the time we get here the layer
    // is sampled at identity. Defensive fallback for unexpected callers.
    if (t.kind !== "affine") {
      return {
        a: 1, b: 0, tx: 0,
        c: 0, d: 1, ty: 0
      };
    }
    const sx = t.scaleX;
    const sy = t.scaleY;
    const rot = t.rotation;

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

  /**
   * Rasterize a quad layer onto a doc-sized CPU canvas using the
   * Canvas2D projective drawer. Returns null when the bake fails (no 2D
   * context, zero-sized doc, etc.). The canvas is cached per layer.
   */
  private bakeQuadLayerToDocCanvas(
    layerId: string,
    transform: Exclude<Layer["transform"], { kind: "affine" }>,
    source: HTMLCanvasElement,
    docW: number,
    docH: number
  ): HTMLCanvasElement | null {
    if (docW <= 0 || docH <= 0) {
      return null;
    }
    let bake = this.quadBakeCanvases.get(layerId);
    if (!bake || bake.width !== docW || bake.height !== docH) {
      bake = window.document.createElement("canvas");
      bake.width = docW;
      bake.height = docH;
      this.quadBakeCanvases.set(layerId, bake);
      // Force re-create the texture on next upload (different dimensions).
      this.quadBakeTextures.get(layerId)?.destroy();
      this.quadBakeTextures.delete(layerId);
    }
    const ctx = bake.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, docW, docH);
    drawImageToQuad(ctx, source, transform.quad);
    return bake;
  }

  private uploadQuadBakeTexture(
    layerId: string,
    canvas: HTMLCanvasElement
  ): GPUTexture {
    let texture = this.quadBakeTextures.get(layerId);
    if (
      !texture ||
      texture.width !== canvas.width ||
      texture.height !== canvas.height
    ) {
      texture?.destroy();
      texture = this.device.createTexture({
        label: `quad-bake-${layerId}`,
        size: { width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) },
        format: "rgba8unorm",
        // RENDER_ATTACHMENT is required by `copyExternalImageToTexture` —
        // the spec implements the copy via an internal render pass. Without
        // it, WebGPU raises "Destination texture needs to have CopyDst and
        // Render usage".
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.quadBakeTextures.set(layerId, texture);
    }
    this.device.queue.copyExternalImageToTexture(
      { source: canvas, flipY: false },
      { texture },
      { width: canvas.width, height: canvas.height }
    );
    return texture;
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

  rotateLayer180(layerId: string): void {
    this.cpuRuntime.rotateLayer180(layerId);
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

  applyLayerSourceBySelectionMask(
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
    source: CanvasImageSource,
    compositeOp: GlobalCompositeOperation = "source-over"
  ): void {
    this.cpuRuntime.applyLayerSourceBySelectionMask(
      layerId,
      offsetX,
      offsetY,
      mask,
      source,
      compositeOp
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
    this.maskTexture?.destroy();
    this.maskTexture = null;
    this.currentSelection = null;
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

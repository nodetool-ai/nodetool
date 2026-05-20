/**
 * WebGPULayerCompositor — the shared layer-compositing engine.
 *
 * Owns the blend + blit render pipelines, the ping-pong accumulation
 * textures, and the sampler. Both the sketch editor and the timeline
 * preview drive it: they upload their own source textures (canvas layers /
 * video frames), seed the background into the read texture, then call
 * {@link renderBlendPass} once per layer and {@link blit} to present.
 *
 * The engine is source-agnostic — it composites `GPUTexture`s addressed by a
 * 2×3 inverse-affine matrix (screen px → layer texel). Sketch supplies
 * `nearest` filtering (pixel-exact paint); the timeline supplies `linear`
 * (smooth scaled video) plus an optional rounded-rect mask.
 */

import {
  BLEND_COMPOSITE_FRAGMENT,
  BLIT_FRAGMENT,
  FULLSCREEN_QUAD_VERTEX
} from "./shaders.js";

/** 2×3 affine matrix mapping screen pixels → layer texels. */
export interface InverseAffine {
  a: number;
  b: number;
  tx: number;
  c: number;
  d: number;
  ty: number;
}

export type CompositorFilter = "nearest" | "linear";

export interface BlendPassParams {
  /** Layer source texture. */
  source: GPUTexture;
  opacity: number;
  /** Canonical blend-mode gpuId (see blendModes.ts). */
  blendModeId: number;
  canvasW: number;
  canvasH: number;
  invAffine: InverseAffine;
  /** Normalized rounded-corner radius 0..0.5. 0 = sharp (default). */
  borderRadius?: number;
}

const IDENTITY_INVERSE_AFFINE: InverseAffine = {
  a: 1,
  b: 0,
  tx: 0,
  c: 0,
  d: 1,
  ty: 0
};

/**
 * Convert a column-major 4×4 clip-space placement matrix (mapping a quad
 * with local coords in [-1,1]² to clip space, as produced by the timeline's
 * `buildTransformMatrix`) into the inverse-affine matrix (screen px → layer
 * texel) the compositor shader expects.
 *
 * The composed screen→texel map is affine, so it is reconstructed exactly by
 * evaluating three points and differencing — no hand-derived trigonometry,
 * which keeps placement faithful to the matrix the caller already trusts.
 */
export function forwardClipMatrixToInverseAffine(
  m: Float32Array | number[],
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): InverseAffine {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return { ...IDENTITY_INVERSE_AFFINE };
  }

  // local → clip: clip = A·local + t (A is the xy 2×2 block, t the xy translation).
  const a00 = m[0];
  const a01 = m[4];
  const a10 = m[1];
  const a11 = m[5];
  const tX = m[12];
  const tY = m[13];

  const det = a00 * a11 - a01 * a10;
  if (Math.abs(det) < 1e-12) {
    return { ...IDENTITY_INVERSE_AFFINE };
  }
  const inv00 = a11 / det;
  const inv01 = -a01 / det;
  const inv10 = -a10 / det;
  const inv11 = a00 / det;

  // screen px → layer texel, evaluated at one point.
  const texelAt = (X: number, Y: number): { x: number; y: number } => {
    // screen px → clip
    const clipX = (X * 2) / canvasWidth - 1;
    const clipY = 1 - (Y * 2) / canvasHeight;
    // clip → local (A⁻¹ · (clip - t))
    const cx = clipX - tX;
    const cy = clipY - tY;
    const localX = inv00 * cx + inv01 * cy;
    const localY = inv10 * cx + inv11 * cy;
    // local [-1,1] → texel [0,dims]. V is flipped: the quad maps local.y = -1
    // (clip-space bottom) to texture row 0 (top), matching the source UVs.
    return {
      x: ((localX + 1) * sourceWidth) / 2,
      y: ((1 - localY) * sourceHeight) / 2
    };
  };

  const p00 = texelAt(0, 0);
  const p10 = texelAt(1, 0);
  const p01 = texelAt(0, 1);

  return {
    a: p10.x - p00.x,
    b: p01.x - p00.x,
    tx: p00.x,
    c: p10.y - p00.y,
    d: p01.y - p00.y,
    ty: p00.y
  };
}

/** Bytes for the blend uniform: 4 × vec4f. */
const BLEND_UNIFORM_BYTES = 64;
/** SDF antialias band (layer-local units) when a border radius is active. */
const BORDER_RADIUS_SMOOTHNESS = 0.01;

export class WebGPULayerCompositor {
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;

  private readonly blendBindGroupLayout: GPUBindGroupLayout;
  private readonly blendPipeline: GPURenderPipeline;
  private readonly blitBindGroupLayout: GPUBindGroupLayout;
  private readonly blitPipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly filterMode: number;

  private pingPongA: GPUTexture | null = null;
  private pingPongB: GPUTexture | null = null;
  private widthPx = 0;
  private heightPx = 0;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    filter: CompositorFilter = "nearest",
    label = "layer-compositor"
  ) {
    this.device = device;
    this.format = format;
    this.filterMode = filter === "linear" ? 1 : 0;

    this.sampler = device.createSampler({
      label: `${label}-sampler`,
      magFilter: filter,
      minFilter: filter,
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    this.blendBindGroupLayout = device.createBindGroupLayout({
      label: `${label}-blend-bgl`,
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
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
        }
      ]
    });

    const blendModule = device.createShaderModule({
      label: `${label}-blend-frag`,
      code: FULLSCREEN_QUAD_VERTEX + BLEND_COMPOSITE_FRAGMENT
    });
    this.blendPipeline = device.createRenderPipeline({
      label: `${label}-blend-pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.blendBindGroupLayout]
      }),
      vertex: { module: blendModule, entryPoint: "vs_main" },
      fragment: {
        module: blendModule,
        entryPoint: "fs_blend",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-strip" }
    });

    this.blitBindGroupLayout = device.createBindGroupLayout({
      label: `${label}-blit-bgl`,
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });
    const blitModule = device.createShaderModule({
      label: `${label}-blit-frag`,
      code: FULLSCREEN_QUAD_VERTEX + BLIT_FRAGMENT
    });
    this.blitPipeline = device.createRenderPipeline({
      label: `${label}-blit-pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.blitBindGroupLayout]
      }),
      vertex: { module: blitModule, entryPoint: "vs_main" },
      fragment: {
        module: blitModule,
        entryPoint: "fs_blit",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-strip" }
    });
  }

  get width(): number {
    return this.widthPx;
  }

  get height(): number {
    return this.heightPx;
  }

  /** The ping-pong accumulation textures. Seed the background into A. */
  get textureA(): GPUTexture | null {
    return this.pingPongA;
  }

  get textureB(): GPUTexture | null {
    return this.pingPongB;
  }

  /** (Re)allocate the ping-pong textures when the canvas size changes. */
  ensureSize(width: number, height: number): void {
    if (this.pingPongA && this.widthPx === width && this.heightPx === height) {
      return;
    }
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    const usage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST;
    this.pingPongA?.destroy();
    this.pingPongB?.destroy();
    this.pingPongA = this.device.createTexture({
      label: "layer-compositor-ping-A",
      size: { width: safeW, height: safeH },
      format: this.format,
      usage
    });
    this.pingPongB = this.device.createTexture({
      label: "layer-compositor-ping-B",
      size: { width: safeW, height: safeH },
      format: this.format,
      usage
    });
    this.widthPx = width;
    this.heightPx = height;
  }

  /**
   * Composite one layer: reads `readTex` (current accumulation) and the
   * layer source, writes the blended result to `writeTex` (full-screen).
   */
  renderBlendPass(
    encoder: GPUCommandEncoder,
    readTex: GPUTexture,
    writeTex: GPUTexture,
    params: BlendPassParams
  ): void {
    const { invAffine } = params;
    const borderRadius = params.borderRadius ?? 0;
    const smoothness = borderRadius > 0 ? BORDER_RADIUS_SMOOTHNESS : 0;

    const uniformData = new Float32Array([
      params.opacity, params.blendModeId, params.canvasW, params.canvasH,
      invAffine.a, invAffine.b, invAffine.tx, 0,
      invAffine.c, invAffine.d, invAffine.ty, 0,
      borderRadius, smoothness, this.filterMode, 0
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: BLEND_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.blendBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: params.source.createView() },
        { binding: 2, resource: readTex.createView() },
        { binding: 3, resource: this.sampler }
      ]
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: writeTex.createView(), loadOp: "clear", storeOp: "store" }
      ]
    });
    pass.setPipeline(this.blendPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  /** Present `srcTex` to a target view (swap chain or other attachment). */
  blit(
    encoder: GPUCommandEncoder,
    srcTex: GPUTexture,
    targetView: GPUTextureView
  ): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.blitBindGroupLayout,
      entries: [{ binding: 0, resource: srcTex.createView() }]
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: targetView, loadOp: "clear", storeOp: "store" }
      ]
    });
    pass.setPipeline(this.blitPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  dispose(): void {
    this.pingPongA?.destroy();
    this.pingPongB?.destroy();
    this.pingPongA = null;
    this.pingPongB = null;
  }
}

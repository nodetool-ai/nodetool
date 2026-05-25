import type {
  ClipEffect,
  ClipColorEffect,
  TrackEffect,
  TrackColorCorrectionEffect,
  TrackVideoBlurEffect,
  TrackSharpenEffect,
  TrackVignetteEffect,
  TrackChromaKeyEffect
} from "@nodetool-ai/timeline";
import {
  createGPUContextFromDevice,
  createExecutor,
  createLabeledTexture,
  LabeledTexture,
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1,
  type GPUContext,
  type Executor,
  type ShaderModule
} from "@nodetool-ai/gpu/pool";
import * as d from "typegpu/data";
import type { AnyWgslStruct, Infer } from "typegpu/data";

interface AggregatedColor {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  tint: number;
  shadows: number;
  highlights: number;
}

const NEUTRAL_COLOR: AggregatedColor = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  hue: 0,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0
};

interface IntermediatePool {
  width: number;
  height: number;
  textures: [LabeledTexture, LabeledTexture];
  /** Currently holds the latest pixel state (input to next pass). */
  currentIndex: 0 | 1;
}

const INTERMEDIATE_USAGE =
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.STORAGE_BINDING |
  GPUTextureUsage.COPY_SRC |
  GPUTextureUsage.COPY_DST;

/**
 * GPU pre-pass for per-clip color grading and Gaussian blur. Caller passes
 * a source GPU texture + ClipEffect[] and gets back a texture (either the
 * original if no effects apply, or a processed intermediate). Intermediate
 * textures are pooled by layer id + source dimensions so we don't reallocate
 * every frame.
 *
 * Each effect is a shared `ShaderModule` from `@nodetool-ai/gpu` dispatched
 * through the shared `Executor` — no host-side uniform packing or bind-group
 * construction lives here anymore.
 */
export class WebGPUEffectsProcessor {
  private device: GPUDevice;
  private ctx: GPUContext;
  private executor: Executor;

  private pools = new Map<string, IntermediatePool>();

  constructor(device: GPUDevice) {
    this.device = device;
    this.ctx = createGPUContextFromDevice(device);
    this.executor = createExecutor();
  }

  /**
   * Run the effects chain on `source` and return a GPU texture with the
   * processed pixels. If no effects are enabled, returns `source` itself
   * (caller should not destroy it on the assumption it's owned).
   */
  process(
    poolKey: string,
    source: GPUTexture,
    width: number,
    height: number,
    clipEffects: ClipEffect[],
    trackEffects: TrackEffect[] = []
  ): GPUTexture {
    const enabledClip = clipEffects.filter((e) => e.enabled);
    const enabledTrack = trackEffects.filter((e) => e.enabled);

    // Aggregate color & blur across clip + track scopes.
    const color = aggregateColor(enabledClip, enabledTrack);
    const blurRadius = aggregateBlurRadius(enabledClip, enabledTrack);
    const sharpen = enabledTrack.find(
      (e): e is TrackSharpenEffect => e.type === "sharpen"
    );
    const vignette = enabledTrack.find(
      (e): e is TrackVignetteEffect => e.type === "vignette"
    );
    const chromaKey = enabledTrack.find(
      (e): e is TrackChromaKeyEffect => e.type === "chromaKey"
    );

    const colorActive = isColorActive(color);
    const blurActive = blurRadius >= 0.5;
    const sharpenActive = sharpen != null && sharpen.amount > 0.001;
    const vignetteActive = vignette != null && vignette.intensity > 0.001;
    const chromaKeyActive = chromaKey != null && chromaKey.tolerance > 0.001;

    if (
      !colorActive &&
      !blurActive &&
      !sharpenActive &&
      !vignetteActive &&
      !chromaKeyActive
    ) {
      return source;
    }

    const pool = this.getPool(poolKey, width, height);
    const encoder = this.device.createCommandEncoder({
      label: `preview-effects-${poolKey}`
    });

    // Source arrives straight-alpha (uploaded with `premultipliedAlpha: false`).
    // Wrap as a straight-labeled `LabeledTexture` and feed it to the first
    // effect: the Executor's auto-bridge inserts `alphaStraightToPremulV1`
    // ahead of effects that need premul input (everything except chromaKey),
    // and chromaKey itself takes straight directly — so there's no redundant
    // straight→premul→straight round-trip when chromaKey runs first.
    const sourceLabeled = new LabeledTexture(source, {
      label: `preview-effects-${poolKey}-src`,
      format: "rgba8unorm",
      width,
      height,
      meta: { colorSpace: "srgb", alpha: "straight", bindingKind: "texture_2d" }
    });
    let pendingFirst = true;

    const step = <S extends AnyWgslStruct>(
      module: ShaderModule<S>,
      params: Infer<S>
    ): void => {
      const inputTex = pendingFirst
        ? sourceLabeled
        : pool.textures[pool.currentIndex];
      const outIdx: 0 | 1 = pendingFirst
        ? 0
        : ((1 - pool.currentIndex) as 0 | 1);
      const [wgX, wgY] = module.workgroupSize;
      this.executor.encode({
        ctx: this.ctx,
        module,
        encoder,
        inputs: { source: inputTex },
        output: pool.textures[outIdx],
        params,
        dispatch: {
          kind: "compute",
          x: Math.ceil(width / wgX),
          y: Math.ceil(height / wgY),
          z: 1
        }
      });
      pool.currentIndex = outIdx;
      pendingFirst = false;
    };

    if (chromaKeyActive && chromaKey) {
      const [r, g, b] = hexToRgb(chromaKey.keyColor);
      step(chromaKeyV1, {
        keyColor: d.vec3f(r, g, b),
        tolerance: chromaKey.tolerance,
        softness: chromaKey.softness,
        spill: chromaKey.spill
      });
    }
    if (colorActive) {
      step(colorGradeV1, { ...color });
    }
    if (blurActive) {
      const sigma = blurRadius / 3;
      step(blurGaussianV1, {
        radius: blurRadius,
        sigma,
        direction: d.vec2f(1, 0)
      });
      step(blurGaussianV1, {
        radius: blurRadius,
        sigma,
        direction: d.vec2f(0, 1)
      });
    }
    if (sharpenActive && sharpen) {
      step(sharpenUnsharpMaskV1, {
        amount: sharpen.amount,
        threshold: sharpen.threshold
      });
    }
    if (vignetteActive && vignette) {
      step(vignetteV1, {
        intensity: vignette.intensity,
        radius: vignette.radius,
        softness: vignette.softness
      });
    }

    this.device.queue.submit([encoder.finish()]);
    return pool.textures[pool.currentIndex].texture;
  }

  private getPool(key: string, width: number, height: number): IntermediatePool {
    const existing = this.pools.get(key);
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }
    if (existing) {
      existing.textures[0].destroy();
      existing.textures[1].destroy();
    }
    const make = (label: string): LabeledTexture =>
      createLabeledTexture(this.device, {
        label,
        width,
        height,
        format: "rgba8unorm",
        usage: INTERMEDIATE_USAGE,
        meta: { colorSpace: "srgb", alpha: "premultiplied" }
      });
    const pool: IntermediatePool = {
      width,
      height,
      textures: [make(`preview-effects-${key}-a`), make(`preview-effects-${key}-b`)],
      currentIndex: 0
    };
    this.pools.set(key, pool);
    return pool;
  }

  releasePool(key: string): void {
    const pool = this.pools.get(key);
    if (!pool) return;
    pool.textures[0].destroy();
    pool.textures[1].destroy();
    this.pools.delete(key);
  }

  retainOnly(keys: Iterable<string>): void {
    const keep = new Set(keys);
    for (const key of [...this.pools.keys()]) {
      if (!keep.has(key)) this.releasePool(key);
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.textures[0].destroy();
      pool.textures[1].destroy();
    }
    this.pools.clear();
    this.ctx.scratch.dispose();
    this.ctx.uniformRing.dispose();
  }
}

function aggregateColor(
  clipEffects: ClipEffect[],
  trackEffects: TrackEffect[]
): AggregatedColor {
  const out: AggregatedColor = { ...NEUTRAL_COLOR };
  for (const e of clipEffects) {
    if (e.type !== "color") continue;
    const c = e as ClipColorEffect;
    out.brightness += c.brightness ?? 0;
    out.contrast *= c.contrast ?? 1;
    out.saturation *= c.saturation ?? 1;
    out.hue += c.hue ?? 0;
    out.temperature += c.temperature ?? 0;
    out.tint += c.tint ?? 0;
    out.shadows += c.shadows ?? 0;
    out.highlights += c.highlights ?? 0;
  }
  for (const e of trackEffects) {
    if (e.type !== "colorCorrection") continue;
    const c = e as TrackColorCorrectionEffect;
    out.brightness += c.brightness;
    out.contrast *= c.contrast;
    out.saturation *= c.saturation;
    out.hue += c.hue;
    out.temperature += c.temperature;
    out.tint += c.tint;
    out.shadows += c.shadows;
    out.highlights += c.highlights;
  }
  out.brightness = clamp(out.brightness, -1, 1);
  out.contrast = clamp(out.contrast, 0, 4);
  out.saturation = clamp(out.saturation, 0, 4);
  out.hue = ((out.hue % 360) + 540) % 360 - 180;
  out.temperature = clamp(out.temperature, -1, 1);
  out.tint = clamp(out.tint, -1, 1);
  out.shadows = clamp(out.shadows, -1, 1);
  out.highlights = clamp(out.highlights, -1, 1);
  return out;
}

function aggregateBlurRadius(
  clipEffects: ClipEffect[],
  trackEffects: TrackEffect[]
): number {
  let radius = 0;
  for (const e of clipEffects) {
    if (e.type === "blur") radius += e.radius;
  }
  for (const e of trackEffects) {
    if (e.type === "videoBlur") radius += (e as TrackVideoBlurEffect).radius;
  }
  return Math.min(40, radius);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 1, 0];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

function isColorActive(c: AggregatedColor): boolean {
  return (
    Math.abs(c.brightness) > 0.001 ||
    Math.abs(c.contrast - 1) > 0.001 ||
    Math.abs(c.saturation - 1) > 0.001 ||
    Math.abs(c.hue) > 0.001 ||
    Math.abs(c.temperature) > 0.001 ||
    Math.abs(c.tint) > 0.001 ||
    Math.abs(c.shadows) > 0.001 ||
    Math.abs(c.highlights) > 0.001
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

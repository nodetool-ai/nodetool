/**
 * motionBlur — the shutter window every render surface samples inside (D10).
 *
 * A frame today is one instant: whatever moves between two frames moves in a
 * hard step, and a fast pan reads as a strobe rather than a blur. Real motion
 * blur is what a shutter does — it stays open for part of the frame and
 * integrates everything that crosses it — so this samples the scene N times
 * inside that opening and averages the results.
 *
 * Two halves live here, both pure and both GPU-free. {@link motionBlurSampleTimes}
 * is the *when*: the sub-frame instants a frame is composited at, which is the
 * only thing the three render surfaces have to agree on for a browser export, a
 * server render and the agent frame preview to blur identically.
 * {@link accumulateBlurSample} is the Canvas 2D *how*: a finished sample drawn
 * onto an accumulator at 1/N. The GPU half is
 * `HeadlessFrameCompositor.renderFrameSamples`, which accumulates the same
 * weights into an `rgba16float` texture instead.
 *
 * Off by default everywhere. N samples cost N× the render, and a document with
 * nothing moving looks the same either way.
 */

/** What a caller asks for. Both fields optional; absent means blur off. */
export interface MotionBlurOptions {
  /**
   * How many instants inside the shutter window to composite and average. 1 or
   * absent is blur off — the frame is its own single instant, and every render
   * surface takes the unchanged single-sample path.
   */
  samplesPerFrame?: number;
  /**
   * How far the shutter opens, in degrees of the frame. 180 is the film
   * convention: open for half the frame. 360 is a fully open shutter, which
   * smears across the whole frame interval.
   */
  shutterAngle?: number;
}

/** The film convention: the shutter is open for half of each frame. */
export const DEFAULT_SHUTTER_ANGLE = 180;

/**
 * Ceiling on samples per frame. Above this the cost is real (N× the whole
 * render) and the picture stops changing — the difference between 32 and 64
 * taps across half a frame is below a pixel for any motion a viewer can follow.
 */
export const MAX_MOTION_BLUR_SAMPLES = 32;

/**
 * A request narrowed to the numbers the sampler uses.
 *
 * It is a {@link MotionBlurOptions} with both fields present, so a resolved
 * value can be handed straight back to {@link motionBlurSampleTimes} — resolving
 * an already-clamped value clamps nothing. That is what lets a render option
 * resolved once at the top of a render travel as one object.
 */
export interface ResolvedMotionBlur extends MotionBlurOptions {
  /** Clamped to `[1, MAX_MOTION_BLUR_SAMPLES]`; 1 means blur off. */
  samplesPerFrame: number;
  /** Clamped to `[0, 360]`. */
  shutterAngle: number;
  /** The weight each sample contributes: `1 / samplesPerFrame`. */
  weight: number;
}

/**
 * Narrow a request to the numbers the sampler runs on.
 *
 * Everything out of range clamps rather than throwing: these arrive from a node
 * property, a JSON render option and an agent tool argument, and a render that
 * refuses to start over `samplesPerFrame: 0` helps nobody. A zero shutter angle
 * is legal and degenerate — every sample lands on the same instant, so the
 * result is the unblurred frame at N× the cost — and is left as asked rather
 * than silently promoted.
 */
export function resolveMotionBlur(
  options: MotionBlurOptions | undefined
): ResolvedMotionBlur {
  const requested = options?.samplesPerFrame;
  const samples =
    typeof requested === "number" && Number.isFinite(requested)
      ? Math.min(MAX_MOTION_BLUR_SAMPLES, Math.max(1, Math.floor(requested)))
      : 1;
  const angle = options?.shutterAngle;
  const shutterAngle =
    typeof angle === "number" && Number.isFinite(angle)
      ? Math.min(360, Math.max(0, angle))
      : DEFAULT_SHUTTER_ANGLE;
  return { samplesPerFrame: samples, shutterAngle, weight: 1 / samples };
}

/**
 * The instants one frame is composited at.
 *
 * The shutter opens at the frame's own time and stays open for
 * `shutterAngle / 360` of the frame interval. Each of the N samples sits at the
 * midpoint of its own equal slice of that opening:
 *
 * ```
 * t_i = timeMs + (i + 0.5) / N × shutterAngle / 360 × frameMs
 * ```
 *
 * Midpoints rather than edges because the first and last sample then carry the
 * same weight as every other one — sampling the endpoints would count the
 * window's two ends half as often as its middle once the results are averaged.
 *
 * One sample returns `[timeMs]` exactly, not the midpoint of the window. A
 * frame with blur off must be the frame it was before blur existed, and shifting
 * it half a shutter forward would change every render that never asked for this.
 */
export function motionBlurSampleTimes(
  timeMs: number,
  frameMs: number,
  options: MotionBlurOptions | undefined
): number[] {
  const { samplesPerFrame: samples, shutterAngle } = resolveMotionBlur(options);
  if (samples <= 1) return [timeMs];
  const windowMs = (shutterAngle / 360) * frameMs;
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    times.push(timeMs + ((i + 0.5) / samples) * windowMs);
  }
  return times;
}

/** Where a blur accumulation draws: the destination's backing-store size. */
export interface BlurAccumulationGeometry {
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The Canvas 2D surface a blur accumulates on — the subset of
 * `CompositeContext2D` this needs, so an accumulator can be any host's canvas.
 */
export interface BlurAccumulationContext2D<TSource> {
  globalAlpha: number;
  globalCompositeOperation: string;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(source: TSource, x: number, y: number, w: number, h: number): void;
}

/** Clear the accumulator. Every sample adds to it, so it starts at nothing. */
export function seedBlurAccumulation<TSource>(
  ctx: BlurAccumulationContext2D<TSource>,
  geometry: BlurAccumulationGeometry
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
}

/**
 * Add one finished sample to the accumulator at `weight`.
 *
 * `lighter` and not `source-over`: the composite this wants is a sum, and
 * `source-over` is a lerp. Drawing N samples over each other at 1/N leaves the
 * last one weighted 1/N and the first one weighted `(1/N)(1-1/N)^(N-1)`, which
 * is a fade, not a mean. `lighter` adds premultiplied colour and adds alpha, so
 * N samples at 1/N land on the premultiplied mean over the mean alpha — and a
 * canvas hands that back as straight alpha, which is what an alpha export and an
 * opaque one both want. Over an opaque ground every sample has alpha 1, the
 * alphas sum to exactly 1, and the result is the plain colour mean.
 */
export function accumulateBlurSample<TSource>(
  ctx: BlurAccumulationContext2D<TSource>,
  sample: TSource,
  weight: number,
  geometry: BlurAccumulationGeometry
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = weight;
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(sample, 0, 0, geometry.canvasWidth, geometry.canvasHeight);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/**
 * The parts of a resolved layer that decide whether the shutter window can
 * move. Structural on purpose: `sceneModel`'s `ActiveLayer` satisfies it, and
 * so does a test's literal, without this module depending on the scene model.
 */
export interface ShutterStaticnessLayer {
  kind: string;
  clip?: { timeRemap?: unknown } | null;
  transition?: unknown;
  matte?: { layer: { kind: string } } | null;
}

/**
 * True when nothing in the frame changes across the shutter window, so N
 * samples would all be the same picture.
 *
 * N samples cost N composites and N decodes. A still frame — a title card, a
 * held image, a document with nothing animating — averages N copies of one
 * picture into that same picture, so the whole cost buys nothing. Four things
 * make a window move: an animation whose window covers the instant (the caller
 * passes that in, since deciding it needs the compiled curves), a transition in
 * flight, a video source whose decoded frame advances with time, and a time
 * remap. Captions count as moving: word highlighting resolves per instant.
 *
 * Conservative in one direction only — a false `false` costs the render it
 * would have cost anyway, a false `true` would drop real blur.
 */
export function shutterWindowIsStatic(
  layers: readonly ShutterStaticnessLayer[],
  hasActiveAnimation: boolean
): boolean {
  if (hasActiveAnimation) return false;
  for (const layer of layers) {
    if (layer.kind === "video" || layer.kind === "caption") return false;
    if (layer.transition) return false;
    if (layer.clip?.timeRemap) return false;
    if (layer.matte && layer.matte.layer.kind === "video") return false;
  }
  return true;
}

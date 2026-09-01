/**
 * Bake a custom timeline animation: run a JS body once in the QuickJS sandbox
 * and turn what it returns into keyframe curves the timeline engine samples.
 *
 * This is the only place a custom animation's code ever executes. The curves it
 * produces are stored on the clip, so the WebGPU preview, the export renderer,
 * the text rasterizer, and the headless compositor all sample the same
 * keyframes and none of them needs a JS engine. That is also why the bake is
 * hermetic — no toolbelt, no secrets, no network: a curve generator is a
 * function of time, and giving it reach would make the same animation render
 * differently depending on where it was baked.
 *
 * The body's contract lives in `@nodetool-ai/timeline` (`animation/custom.ts`),
 * shared with the compiler and the validator.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  buildCustomAnimationInputs,
  curvesFromScriptOutput,
  resolveCustomMask,
  type AnimationRole,
  type BuildCustomAnimationInputsOptions,
  type CompiledAnimationMask,
  type PropertyCurve
} from "@nodetool-ai/timeline";
import { runCodeBody } from "./capabilities/code.js";

/**
 * Wall-clock ceiling on a bake. A curve generator is arithmetic over at most a
 * few thousand samples; anything slower is a runaway loop, and the editor is
 * waiting on this call.
 */
export const CUSTOM_ANIMATION_BAKE_TIMEOUT_SECONDS = 10;

export interface BakeCustomAnimationParams {
  /** The body to run. Same shape as a Code node body. */
  code: string;
  role: AnimationRole;
  /** The animation's own window length in ms. */
  durationMs: number;
  /** The clip the animation sits on, in ms. */
  clipDurationMs: number;
  canvas: { width: number; height: number };
  params?: Record<string, number | string | boolean>;
  staggerCount?: number;
  sampleCount?: number;
  /** Capped at {@link CUSTOM_ANIMATION_BAKE_TIMEOUT_SECONDS}. */
  timeoutSeconds?: number;
}

export interface BakeCustomAnimationResult {
  ok: boolean;
  /** Present only when `ok` — normalized and ready to store on the clip. */
  curves?: PropertyCurve[];
  /** Present when the body returned a mask for a `wipeProgress` curve. */
  mask?: CompiledAnimationMask;
  logs: string[];
  error?: string;
  duration_ms: number;
}

/**
 * Run one custom-animation body and return its curves. Returns rather than
 * throws: a body that fails is a result to show the author, not an exception.
 */
export async function bakeCustomAnimation(
  context: ProcessingContext,
  params: BakeCustomAnimationParams
): Promise<BakeCustomAnimationResult> {
  const inputOptions: BuildCustomAnimationInputsOptions = {
    role: params.role,
    durationMs: params.durationMs,
    clipDurationMs: params.clipDurationMs,
    canvas: params.canvas
  };
  if (params.params !== undefined) {
    inputOptions.params = params.params;
  }
  if (params.staggerCount !== undefined) {
    inputOptions.staggerCount = params.staggerCount;
  }
  if (params.sampleCount !== undefined) {
    inputOptions.sampleCount = params.sampleCount;
  }
  const inputs = buildCustomAnimationInputs(inputOptions);

  const run = await runCodeBody(context, {
    code: params.code,
    inputs: { ...inputs },
    secrets: [],
    timeoutSeconds: Math.min(
      params.timeoutSeconds ?? CUSTOM_ANIMATION_BAKE_TIMEOUT_SECONDS,
      CUSTOM_ANIMATION_BAKE_TIMEOUT_SECONDS
    )
  });

  if (!run.ok) {
    return {
      ok: false,
      logs: run.logs,
      error: run.error ?? "The animation body failed.",
      duration_ms: run.duration_ms
    };
  }

  const baked = curvesFromScriptOutput(run.outputs);
  if (!baked.ok) {
    return {
      ok: false,
      logs: run.logs,
      error: baked.error,
      duration_ms: run.duration_ms
    };
  }

  const mask = resolveCustomMask(
    baked.curves,
    (run.outputs as Record<string, unknown> | undefined)?.mask
  );
  if (!mask.ok) {
    return {
      ok: false,
      logs: run.logs,
      error: mask.error,
      duration_ms: run.duration_ms
    };
  }

  const result: BakeCustomAnimationResult = {
    ok: true,
    curves: baked.curves,
    logs: run.logs,
    duration_ms: run.duration_ms
  };
  if (mask.mask !== undefined) {
    result.mask = mask.mask;
  }
  return result;
}

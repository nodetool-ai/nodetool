/**
 * Canonical blend-mode catalog shared by every NodeTool compositor:
 *
 *   - the sketch editor (WebGPU + Canvas2D layer compositing)
 *   - the timeline preview compositor (WebGPU clip compositing)
 *   - the Compositor image node (server-side Sharp/libvips compositing)
 *
 * The mode names come from `@nodetool-ai/protocol/blend-modes`, where the
 * document schemas validate against them, and are re-exported here so callers
 * see one catalog. This module owns what a compositor needs on top of a name:
 * the stable numeric ids baked into WGSL shader uniforms, the Canvas2D
 * `globalCompositeOperation` mapping, the Sharp/libvips `blend` mapping, and
 * the ordered list that populates UI dropdowns. Keeping those in one table
 * guarantees the implementations agree on ordering and on the numeric ids the
 * shaders switch on.
 */

import {
  BLEND_MODE_TUPLE,
  type BlendMode
} from "@nodetool-ai/protocol/blend-modes";

export { BLEND_MODE_TUPLE, type BlendMode };

/**
 * Canvas2D `globalCompositeOperation` values we map onto. Declared as a
 * literal union (not the DOM `GlobalCompositeOperation`) so this package
 * builds without the DOM lib; every member is a valid DOM value, so callers
 * can cast the result to `GlobalCompositeOperation` safely.
 */
export type CanvasCompositeOp =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "lighter";

export interface BlendModeInfo {
  value: BlendMode;
  /** Human-readable label for UI dropdowns. */
  label: string;
  /**
   * Stable numeric id consumed by the WGSL `applyBlendMode` switch (see
   * {@link WGSL_BLEND_FUNCTIONS}). Never renumber — shaders depend on it.
   */
  gpuId: number;
  /** Canvas2D `globalCompositeOperation` equivalent. */
  canvasOp: CanvasCompositeOp;
  /** Sharp/libvips `blend` string for server-side compositing. */
  sharpBlend: string;
}

/**
 * The canonical table. Order is the UI display order. `gpuId` values 0–11
 * match the historical sketch-editor shader switch; `add` is 12.
 */
export const BLEND_MODE_INFOS: readonly BlendModeInfo[] = [
  { value: "normal", label: "Normal", gpuId: 0, canvasOp: "source-over", sharpBlend: "over" },
  { value: "multiply", label: "Multiply", gpuId: 1, canvasOp: "multiply", sharpBlend: "multiply" },
  { value: "screen", label: "Screen", gpuId: 2, canvasOp: "screen", sharpBlend: "screen" },
  { value: "overlay", label: "Overlay", gpuId: 3, canvasOp: "overlay", sharpBlend: "overlay" },
  { value: "darken", label: "Darken", gpuId: 4, canvasOp: "darken", sharpBlend: "darken" },
  { value: "lighten", label: "Lighten", gpuId: 5, canvasOp: "lighten", sharpBlend: "lighten" },
  { value: "color-dodge", label: "Color Dodge", gpuId: 6, canvasOp: "color-dodge", sharpBlend: "color-dodge" },
  { value: "color-burn", label: "Color Burn", gpuId: 7, canvasOp: "color-burn", sharpBlend: "color-burn" },
  { value: "hard-light", label: "Hard Light", gpuId: 8, canvasOp: "hard-light", sharpBlend: "hard-light" },
  { value: "soft-light", label: "Soft Light", gpuId: 9, canvasOp: "soft-light", sharpBlend: "soft-light" },
  { value: "difference", label: "Difference", gpuId: 10, canvasOp: "difference", sharpBlend: "difference" },
  { value: "exclusion", label: "Exclusion", gpuId: 11, canvasOp: "exclusion", sharpBlend: "exclusion" },
  { value: "add", label: "Add", gpuId: 12, canvasOp: "lighter", sharpBlend: "add" }
] as const;

/** Ordered list of `{ value, label }` for populating UI dropdowns. */
export const BLEND_MODES: readonly { value: BlendMode; label: string }[] =
  BLEND_MODE_INFOS.map(({ value, label }) => ({ value, label }));

/** All canonical blend-mode values in display order (literal tuple). */
export const BLEND_MODE_VALUES = BLEND_MODE_TUPLE;

const INFO_BY_VALUE = new Map<BlendMode, BlendModeInfo>(
  BLEND_MODE_INFOS.map((info) => [info.value, info])
);

/**
 * Legacy / alias names accepted by {@link coerceBlendMode} that are not
 * themselves canonical values. The Compositor image node historically
 * stored `"over"` (the libvips name) for normal blending.
 */
const ALIASES: Record<string, BlendMode> = {
  over: "normal"
};

/**
 * Coerce an arbitrary input to a canonical {@link BlendMode}. Unknown values
 * (including stray data URLs that can leak into persisted UI state) fall back
 * to `"normal"`. Accepts the legacy `"over"` alias.
 */
export function coerceBlendMode(value: unknown): BlendMode {
  if (typeof value === "string") {
    if (INFO_BY_VALUE.has(value as BlendMode)) {
      return value as BlendMode;
    }
    const alias = ALIASES[value];
    if (alias) {
      return alias;
    }
  }
  return "normal";
}

/** Numeric id for the WGSL `applyBlendMode` switch. */
export function blendModeGpuId(value: unknown): number {
  return INFO_BY_VALUE.get(coerceBlendMode(value))?.gpuId ?? 0;
}

/** Canvas2D `globalCompositeOperation` for a blend mode. */
export function blendModeToCanvasOp(value: unknown): CanvasCompositeOp {
  return INFO_BY_VALUE.get(coerceBlendMode(value))?.canvasOp ?? "source-over";
}

/** Sharp/libvips `blend` string for a blend mode. */
export function blendModeToSharpBlend(value: unknown): string {
  return INFO_BY_VALUE.get(coerceBlendMode(value))?.sharpBlend ?? "over";
}

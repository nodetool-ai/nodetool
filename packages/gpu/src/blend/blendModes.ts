/**
 * Canonical blend-mode catalog shared by every NodeTool compositor:
 *
 *   - the sketch editor (WebGPU + Canvas2D layer compositing)
 *   - the timeline preview compositor (WebGPU clip compositing)
 *   - the Compositor image node (server-side Sharp/libvips compositing)
 *
 * This module is the single source of truth for the `BlendMode` union, the
 * ordered list used to populate UI dropdowns, the stable numeric ids baked
 * into WGSL shader uniforms, the Canvas2D `globalCompositeOperation`
 * mapping, and the Sharp/libvips `blend` mapping. Keeping all of these in
 * one table guarantees the four implementations agree on naming, ordering,
 * and the numeric ids that the GPU shaders switch on.
 */

/**
 * Canonical blend modes in display order. Declared as a `const` tuple so it
 * can drive both the {@link BlendMode} union and a Zod `z.enum` (which needs
 * a literal tuple to infer the union). `normal` is source-over; the next
 * eleven follow the W3C compositing spec; `add` is additive (Canvas2D
 * `lighter`, libvips `add`).
 */
export const BLEND_MODE_TUPLE = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "add"
] as const;

export type BlendMode = (typeof BLEND_MODE_TUPLE)[number];

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

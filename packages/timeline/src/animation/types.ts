/**
 * Motion-design animation types (pure, no DOM/GPU/store access).
 *
 * A `ClipAnimation` is a named preset attached to a clip. Presets never render
 * directly; they compile to keyframe curves (see `compile.ts`) sampled by one
 * sampler (`sample.ts`). This keeps the authoring surface small (preset + a few
 * params) while leaving room for a curve editor later without a schema break.
 */

/** What phase of the clip an animation drives. */
export type AnimationRole = "in" | "out" | "emphasis" | "loop";

export type EasingId =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut" // cubic
  | "easeOutBack" // overshoot (pop)
  | "easeOutElastic"
  | "easeOutBounce";

export interface ClipAnimation {
  /** `crypto.randomUUID()` at creation. */
  id: string;
  role: AnimationRole;
  /**
   * An {@link AnimationPresetId}. Typed `string` on purpose: documents saved by
   * a newer client may carry ids this build doesn't know — they parse fine and
   * are skipped at compile time (forward compat). Tool inputs and the UI
   * constrain to the catalog union.
   */
  preset: string;
  /** Animation length in ms. For `"loop"`, the period of one cycle. */
  durationMs: number;
  /**
   * `"in" | "emphasis" | "loop"`: offset from clip start to window start.
   * `"out"`: offset from clip END back to window end (0 = ends exactly at clip
   * end). Default 0.
   */
  delayMs?: number;
  /** Overrides the preset default and every per-segment easing when set. */
  easing?: EasingId;
  /** Default true. Disabled animations are kept but not evaluated. */
  enabled?: boolean;
  /** Preset-specific knobs; unknown keys ignored. See the preset catalog. */
  params?: Record<string, number | string | boolean>;
}

/**
 * Edge a wipe reveal starts from, in the layer's own (pre-rotation) space:
 * `"up"` is the layer's top edge, `"down"` its bottom edge. The wipe edge
 * rotates with the layer when the clip is rotated.
 */
export type WipeDirection = "left" | "right" | "up" | "down";

/**
 * Union of every preset id in the catalog. Kept in sync with
 * `ANIMATION_PRESETS` in `presets.ts`.
 */
export type AnimationPresetId =
  | "fade"
  | "slide"
  | "pop"
  | "spin"
  | "wipe"
  | "blur"
  | "pulse"
  | "flash"
  | "shake"
  | "bounce"
  | "colorFade"
  | "kenBurns"
  | "float"
  | "breathe"
  | "rotate";

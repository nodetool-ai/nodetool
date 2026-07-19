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

/** Which unit of a staggered animation starts first. */
export type StaggerFrom = "start" | "end" | "center";

/**
 * Per-unit stagger config: the animation's window applies once per unit
 * (word), each unit's window delayed from the previous by `offsetMs`.
 * Only meaningful on text clips — the text rasterizer draws each word with
 * its own sample. On other clips (and for unknown `unit`s) the animation
 * falls back to the whole-block behavior.
 */
export interface AnimationStagger {
  /**
   * Unit the animation splits into. Only `"word"` is implemented; unknown
   * units (a future `"character"`) compile as un-staggered block animations
   * for forward compat, mirroring how unknown presets are handled.
   */
  unit: string;
  /** Delay between successive units in ms. Must be > 0 to take effect. */
  offsetMs: number;
  /** Which unit animates first. Default `"start"` (first word first). */
  from?: StaggerFrom;
}

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
  /**
   * Per-word stagger. When set on a text clip, this animation's
   * transform/opacity curves run once per word with a per-word time offset
   * (see `sampleStaggeredAnimations`); effect/mask curves stay block-level.
   * Ignored (block animation) on non-text clips and full-clip presets.
   */
  stagger?: AnimationStagger;
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

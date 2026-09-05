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
 * What a staggered animation splits a text clip into. `"word"` is the
 * whitespace-separated word, `"character"` the grapheme cluster (an emoji or a
 * base letter plus its combining marks counts once, and the whitespace between
 * words is a unit that is timed but draws nothing), `"line"` the wrapped line.
 */
export const STAGGER_UNITS = ["word", "character", "line"] as const;

export type StaggerUnit = (typeof STAGGER_UNITS)[number];

/**
 * Narrow a document's `stagger.unit` string to a unit this build implements,
 * or `null` for one it does not — which compiles un-staggered rather than
 * failing the document (I2).
 */
export function parseStaggerUnit(unit: string): StaggerUnit | null {
  return (STAGGER_UNITS as readonly string[]).includes(unit)
    ? (unit as StaggerUnit)
    : null;
}

/**
 * Per-unit stagger config: the animation's window applies once per unit, each
 * unit's window delayed from the previous by `offsetMs`. Only meaningful on
 * text clips — the text rasterizer draws each unit with its own sample. On
 * other clips (and for unknown `unit`s) the animation falls back to the
 * whole-block behavior.
 */
export interface AnimationStagger {
  /**
   * Unit the animation splits into — a {@link StaggerUnit}. Typed `string`
   * for the same forward compat `preset` has: a unit a newer client wrote
   * compiles as an un-staggered block animation rather than failing the
   * document. A clip draws in one unit, so when its animations disagree the
   * first enabled one wins and the rest compile un-staggered.
   */
  unit: string;
  /** Delay between successive units in ms. Must be > 0 to take effect. */
  offsetMs: number;
  /** Which unit animates first. Default `"start"` (first unit first). */
  from?: StaggerFrom;
}

/**
 * A baked custom-animation payload as it sits in the document. Strings are
 * loose here for the same forward compat `preset` has: a curve naming a
 * property or easing this build does not know parses fine and is rejected (or
 * ignored) at compile time rather than failing the whole document. The one
 * gate is `normalizeCustomCurves` in `custom.ts`.
 */
export interface CustomClipAnimation {
  /** JS script document the curves were baked from. */
  scriptId?: string;
  /** Inline body the curves were baked from. */
  code?: string;
  /** ISO timestamp of the bake that produced `curves`. */
  bakedAt?: string;
  curves: { property: string; keyframes: { t: number; value: number; easing?: string }[] }[];
  /** Required when a curve drives `wipeProgress`. */
  mask?: { direction: string; softness: number };
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
   * end). Default 0. For `"loop"` a negative value is a phase offset: the
   * window opens at clip start and the cycle is counted from `delayMs`, which
   * is how a split keeps a loop mid-cycle on its right half.
   */
  delayMs?: number;
  /**
   * Overrides the preset default and every per-segment easing when set.
   * Typed `string` for the same reason `preset` is: it carries the easing
   * grammar (`cubic-bezier(...)`, `spring(...)`) as well as an
   * {@link EasingId}, and an id this build cannot parse eases linearly rather
   * than failing the document. `parseEasing` is the gate.
   */
  easing?: string;
  /** Default true. Disabled animations are kept but not evaluated. */
  enabled?: boolean;
  /** Preset-specific knobs; unknown keys ignored. See the preset catalog. */
  params?: Record<string, number | string | boolean>;
  /**
   * Baked curves for a `"custom"` preset animation — motion written as
   * JavaScript rather than picked from the catalog. See `custom.ts`.
   */
  custom?: CustomClipAnimation;
  /**
   * Per-unit stagger. When set on a text clip, this animation's
   * transform/opacity curves run once per word, character or line with a
   * per-unit time offset (see `sampleStaggeredAnimations`); effect/mask
   * curves stay block-level. Ignored (block animation) on non-text clips and
   * full-clip presets.
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
  | "rotate"
  | "squash"
  | "hueShift";

/**
 * Every property a curve can drive, as a runtime list so a custom animation's
 * curves can be checked against it (see `custom.ts`).
 *
 * - `offsetX` / `offsetY` — canvas px, added to `transform.position`
 * - `scale` — uniform multiplier on `ClipTransform.scale`
 * - `rotation` — radians, added to `ClipTransform.rotation`
 * - `opacity` — multiplier on the layer's resolved opacity
 * - `wipeProgress` — 0 = fully hidden, 1 = fully revealed (needs a mask)
 *
 * The last three are effect params applied through the compositor's per-layer
 * effect pre-pass. The engine stays pure: they compose into synthesized
 * `ClipEffect`s at the render site (see `resolveAnimatedLayerProps`), matching
 * what the `color.grade` / Gaussian-blur pipeline already applies.
 *
 * - `blur` — added to the layer's blur radius, in source px (identity 0)
 * - `brightness` — added to the grade shader's brightness term, -1..1 (identity 0)
 * - `saturation` — multiplies the grade shader's saturation, 0..4 (identity 1)
 * - `contrast` — multiplies the grade shader's contrast, 0..4 (identity 1)
 * - `hue` — added to the grade shader's hue rotation, degrees (identity 0)
 * - `temperature` — added to the grade's cool→warm term, -1..1 (identity 0)
 * - `tint` — added to the grade's green→magenta term, -1..1 (identity 0)
 *
 * Four channels set an absolute value rather than composing with the clip's:
 *
 * - `positionX` / `positionY` — replace `transform.position`, canvas px
 * - `anchorX` / `anchorY` — replace `transform.anchor`, normalized 0..1
 * - `trimStart` / `trimEnd` — replace the shape's stroked sub-range, 0..1
 */
export const ANIMATED_PROPERTIES = [
  "offsetX",
  "offsetY",
  "scale",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "wipeProgress",
  "blur",
  "brightness",
  "saturation",
  "contrast",
  "hue",
  "temperature",
  "tint",
  "positionX",
  "positionY",
  "anchorX",
  "anchorY",
  "trimStart",
  "trimEnd"
] as const;

export type AnimatedProperty = (typeof ANIMATED_PROPERTIES)[number];

/**
 * How several animations driving one channel combine. The sampler folds by
 * this table rather than by a switch, so a new channel declares its fold here
 * and nowhere else (I3).
 *
 * - `add` — offsets and additive grade terms sum
 * - `multiply` — scale, opacity and multiplicative grade terms multiply
 * - `min` — overlapping wipes keep the smaller progress: more hidden wins
 * - `replace` — the last enabled animation in document order wins; the
 *   validator warns when two replace curves overlap in time
 */
export const ANIMATED_PROPERTY_FOLD: Record<
  AnimatedProperty,
  "add" | "multiply" | "replace" | "min"
> = {
  offsetX: "add",
  offsetY: "add",
  scale: "multiply",
  scaleX: "multiply",
  scaleY: "multiply",
  rotation: "add",
  opacity: "multiply",
  wipeProgress: "min",
  blur: "add",
  brightness: "add",
  saturation: "multiply",
  contrast: "multiply",
  hue: "add",
  temperature: "add",
  tint: "add",
  positionX: "replace",
  positionY: "replace",
  anchorX: "replace",
  anchorY: "replace",
  trimStart: "replace",
  trimEnd: "replace"
};

/**
 * Which fold pass a channel belongs to when its animation is staggered. A
 * staggered animation's transform and opacity channels run once per unit at
 * that unit's own time; the effect, mask and shape channels stay
 * block-level over the full stagger span, because the compositor applies them
 * to the whole layer. The sampler classifies by this table rather than by a
 * list of its own, so a new channel picks its pass here.
 */
export const ANIMATED_PROPERTY_PASS: Record<
  AnimatedProperty,
  "motion" | "effects"
> = {
  offsetX: "motion",
  offsetY: "motion",
  scale: "motion",
  scaleX: "motion",
  scaleY: "motion",
  rotation: "motion",
  opacity: "motion",
  wipeProgress: "effects",
  blur: "effects",
  brightness: "effects",
  saturation: "effects",
  contrast: "effects",
  hue: "effects",
  temperature: "effects",
  tint: "effects",
  positionX: "motion",
  positionY: "motion",
  anchorX: "motion",
  anchorY: "motion",
  trimStart: "effects",
  trimEnd: "effects"
};

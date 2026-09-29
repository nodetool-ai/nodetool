/**
 * Types for `@nodetool-ai/sandbox-timeline`. Covers the pack's top-level
 * exports and the authoring objects `video()`/`scene()`/`use()` hand back —
 * precise enough to catch `caret: true` (an object, not a boolean) or a
 * `stack`/`row` `align` typo at type-check time, via `nodetool jsscript
 * validate` or any TS host that resolves this specifier.
 *
 * This is a first pass, kept in sync with `index.js`'s own exports by
 * `tests/pack-dts-exports.test.ts` (a plain export-name comparison, not a
 * structural one) — a signature can still drift from its real implementation
 * between passes. `s.barChart`/`lineChart`/`areaChart`/`donut`/`statCounter`
 * (`charts.js`) are typed loosely (`(...args: unknown[]) => Clip`) pending a
 * pass that gives them the same precision as the rest of `SceneApi`.
 */

/** A hex colour string, `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`. */
export type HexColor = string;

/** `"in"|"out"|"inOut"|"outExpo"|"inExpo"|"linear"`, or a raw curve string (`"spring(170,16,1)"`, `"cubic-bezier(...)"`). */
export type EaseName =
  | "in" | "out" | "inOut" | "outExpo" | "inExpo" | "linear"
  | (string & {});

export type StaggerUnit = "word" | "character" | "line";

export interface Gradient {
  type: "linear" | "radial";
  angle?: number;
  stops: Array<{ offset: number; color: string }>;
}

export type Fill = HexColor | Gradient;

/** `[["M", x, y], ["L", x, y], …]`, in px from the frame centre. `H`/`V` take one coordinate; `A` is `[rx, ry, xRotDeg, largeArc, sweep, x, y]`. */
export type PathPoints = ReadonlyArray<readonly [command: string, ...args: number[]]>;

/** A two-value `[from, to]`/`[from, to, easing]` pair, or a waypoint list `[[t, value], [t, value, easing]?, …]`. */
export type AnimSpec =
  | readonly [from: number, to: number, easing?: EaseName]
  | ReadonlyArray<readonly [t: number, value: number, easing?: EaseName]>;

/** `{direction, softness}` — required whenever a curve drives `wipeProgress`. Sets `animation.custom.mask`; unrelated to `ClipFieldOptions.mask`, the static crop mask. */
export interface WipeMask {
  direction: string;
  softness: number;
}

export interface EnterOptions {
  from: Record<string, number>;
  at?: number;
  dur?: number;
  ease?: EaseName;
  by?: StaggerUnit;
  staggerMs?: number;
  mask?: WipeMask;
}

export interface ExitOptions {
  to: Record<string, number>;
  at?: number;
  dur?: number;
  ease?: EaseName;
}

export interface AnimateOptions {
  at?: number;
  dur?: number;
  ease?: EaseName;
  role?: "in" | "out" | "loop" | "emphasis" | string;
  by?: StaggerUnit;
  staggerMs?: number;
  mask?: WipeMask;
}

export interface LoopOptions {
  ease?: EaseName;
}

export interface CountOptions {
  from: number;
  to: number;
  at?: number;
  dur?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  padTo?: number;
  groupSeparator?: string;
  ease?: EaseName;
}

export interface ScrambleOptions {
  at?: number;
  dur?: number;
  charset?: string;
  seed?: number;
  ease?: EaseName;
}

export interface DrawOptions {
  at?: number;
  dur?: number;
  ease?: EaseName;
  mask?: WipeMask;
}

/** Every key besides these five is a preset param — see `PresetParamSpec[]` per preset in `packages/timeline/src/animation/presets.ts`. */
export interface PresetOptions {
  at?: number;
  dur?: number;
  ease?: EaseName;
  role?: string;
  by?: StaggerUnit;
  staggerMs?: number;
  [param: string]: unknown;
}

export type PresetName =
  | "fade" | "slide" | "pop" | "spin" | "wipe" | "blur" | "colorFade"
  | "pulse" | "flash" | "shake" | "bounce" | "squash" | "kenBurns" | "float"
  | "breathe" | "rotate" | "hueShift" | "orbit" | "followPath" | "typewriter";

/** A typewriter caret — an object, never a bare boolean. */
export interface TypewriterCaret {
  color?: HexColor;
  widthPx?: number;
  blinkPeriodMs?: number;
}

export interface TypewriterOptions {
  at?: number;
  dur?: number;
  caret?: TypewriterCaret;
}

export interface ExprSample {
  p: number;
  frame: number;
  fps: number;
}

export interface ExprOptions {
  at?: number;
  dur?: number;
  role?: string;
}

export interface MorphOptions {
  at?: number;
  dur?: number;
  ease?: EaseName;
}

export type ReactMode = "envelope" | "beats";
export type ReactProperty = "scale" | "opacity" | "offsetX" | "offsetY";

export interface ReactOptions {
  prop?: ReactProperty;
  property?: ReactProperty;
  mode?: ReactMode;
  range?: readonly [quiet: number, loud: number];
  gain?: number;
  smooth?: number;
  attack?: number;
  release?: number;
  offset?: number;
  tolerance?: number;
  maxPoints?: number;
  frameMs?: number;
  maxSeconds?: number;
  replace?: boolean;
  /** Not supported — `bake_audio_animation` measures the full mix or its onsets, never one band. Passing this throws. */
  band?: never;
}

/** A transform override; `x`/`y`/`s` are shorthand for `position`/`scale`, `tx` carries any other transform field. */
export interface TransformOverride {
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  rotation?: number;
  anchor?: { x: number; y: number };
  depthPx?: number;
  [field: string]: unknown;
}

/**
 * Fields every element option object accepts as-is, passed straight onto the
 * clip's own document fields (see the pack's SKILL.md `Elements` table).
 */
export interface ClipFieldOptions {
  id?: string;
  name?: string;
  at?: number;
  dur?: number;
  x?: number;
  y?: number;
  s?: number;
  /** Degrees — a shortcut for `transform.rotation`, converted to radians. Sibling to `x`/`y`/`s`, same relationship as those have to `transform.position`/`transform.scale`. */
  rotation?: number;
  /** A shortcut for `transform.anchor`, `{x, y}` fractions of the clip's own box. */
  anchor?: { x: number; y: number };
  tx?: Record<string, unknown>;
  transform?: TransformOverride;
  parent?: string;
  /** An entry's `id`/`enabled: true` are filled in when left out. */
  effects?: unknown[];
  opacity?: number;
  blendMode?: string;
  /** The static crop mask — unrelated to `EnterOptions`/`AnimateOptions`/`DrawOptions`'s `mask` (`WipeMask`), which drives a `wipeProgress` animation instead. */
  mask?: unknown;
  matte?: unknown;
  crop?: unknown;
  motionBlur?: unknown;
  steppedTime?: unknown;
  repeater?: unknown;
  inPointMs?: number;
  outPointMs?: number;
  speedBaked?: boolean;
  fadeInShape?: unknown;
  fadeOutShape?: unknown;
  /** Sugar for a flex-item background plate: taken out of flow, sized to its flex parent's computed box. */
  absolute?: boolean;
  inset?: number | { top?: number; right?: number; bottom?: number; left?: number };
  flexItem?: FlexItemOptions;
  layout?: unknown;
}

/** A clip descriptor with the motion primitives attached — what every scene element call returns. */
export interface Clip extends Record<string, unknown> {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  mediaType: string;
  parentId: string;
  enter(o: EnterOptions): Clip;
  exit(o: ExitOptions): Clip;
  animate(props: Record<string, AnimSpec>, o?: AnimateOptions): Clip;
  loop(props: Record<string, AnimSpec>, periodSec: number, o?: LoopOptions): Clip;
  count(o: CountOptions): Clip;
  scramble(o?: ScrambleOptions): Clip;
  /** `by`/`staggerMs` mean the same as on `enter()`/`animate()` — required for a `glyph.*` target, which the document validator refuses with no stagger unit. */
  tween(target: string, keyframes: ReadonlyArray<readonly [t: number, value: unknown, easing?: EaseName]>, o?: { at?: number; dur?: number; by?: StaggerUnit; staggerMs?: number }): Clip;
  draw(o?: DrawOptions): Clip;
  preset(name: PresetName | (string & {}), o?: PresetOptions): Clip;
  /** Replaces the clip's animations — a typewriter is the whole entrance. */
  typewriter(o?: TypewriterOptions): Clip;
  /** A hand-written motion function baked to keyframes at authoring time — nothing runs at render time. */
  expr(fn: (t: number, sample: ExprSample) => Record<string, unknown> | undefined, o?: ExprOptions): Clip;
  /** The clip must be created with `s.path(points, o)` — only straight (M/L/Z) paths morph. */
  morph(toPoints: PathPoints, o?: MorphOptions): Clip;
  react(audioClip: Clip, o: ReactOptions): Clip;
}

export interface TextStyleOverride {
  lineHeight?: number;
  verticalAlign?: "top" | "center" | "bottom";
  stroke?: string;
  shadow?: unknown;
  background?: string;
  fill?: Fill;
  [field: string]: unknown;
}

export interface TextOptions extends Omit<ClipFieldOptions, "anchor"> {
  size?: number;
  weight?: number;
  color?: HexColor;
  /** A `fonts` key (from `video({fonts})`) or a literal family string. */
  font?: string;
  /** Em, a fraction of `size`: `-0.04` tight, `0.2` wide caps. */
  tracking?: number;
  italic?: boolean;
  /** Horizontal alignment — `text()` destructures this itself, so `ClipFieldOptions.anchor`'s `{x, y}` transform shortcut never reaches it. */
  anchor?: "left" | "right" | "center";
  /** Max width as a frame fraction. Ignored once this text is a child of a `stack`/`row` — a flex container measures and sizes it itself. */
  mw?: number;
  /** Text-on-path: the same point commands `s.path()` takes. */
  path?: PathPoints;
  style?: TextStyleOverride;
}

export interface ShapeOptions extends ClipFieldOptions {
  kind?: "rect" | "ellipse";
  /** Corner radius, px. */
  r?: number;
  stroke?: string;
  /** Stroke width, px. */
  sw?: number;
  shape?: Record<string, unknown>;
}

export interface PathOptions extends ClipFieldOptions {
  fill?: Fill;
  stroke?: string;
  sw?: number;
}

/** A time-remap keyframe: `t` 0..1 across the clip, `sourceAt` seconds into the *source* media. */
export interface TimeRemapKeyframe {
  t: number;
  sourceAt: number;
  ease?: EaseName;
}

export interface MediaOptions extends ClipFieldOptions {
  /** Seconds into the source. */
  in?: number;
  /** dB. */
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Playback rate. */
  speed?: number;
  mute?: boolean;
  remap?: readonly TimeRemapKeyframe[];
}

/** `s.adjust(effects, o)`'s options; each `effects` entry's `id`/`enabled: true` are filled in when left out, same as `ClipFieldOptions.effects`. */
export interface AdjustOptions extends ClipFieldOptions {}

/** `position: "absolute"` takes a flex-item child out of flow, sized by `inset`; everything else places it inside the flex algebra. */
export interface FlexItemOptions {
  position?: "absolute" | "relative";
  inset?: number | { top?: number; right?: number; bottom?: number; left?: number };
  grow?: number;
  shrink?: number;
  basis?: number | `${number}%`;
  alignSelf?: AlignOption;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
}

export type AnchorName =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right";

export type Anchor = AnchorName | { x: number; y: number };
export type AlignOption = "start" | "center" | "end" | "stretch" | "baseline";
export type JustifyOption = "start" | "center" | "end" | "between" | "around" | "evenly";

/** A real flex container (Yoga): `children` become its real children (`parentId`), laid out by the document's own flex resolver. */
export interface ContainerOptions {
  name?: string;
  parent?: string;
  /** The container's placement in the frame; `anchor` names the point of its *computed* box that lands here. Default the frame centre. */
  at?: { x: number; y: number };
  anchor?: Anchor;
  /** Cross axis (`alignItems`). Default `"start"`. */
  align?: AlignOption;
  /** Main axis (`justifyContent`). */
  justify?: JustifyOption;
  gap?: number;
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  /** `true` sets `"wrap"`; a string passes straight to `flexWrap`. Confirmed with r1-api: `"wrap" | "wrap-reverse"` is the supported contract. */
  wrap?: boolean | "wrap" | "wrap-reverse";
  /** How this container itself behaves as a child of an enclosing flex container — passed straight through to `flexItem`. A per-child flexItem is set on that child's own creation call (`o.flexItem`), not here. */
  item?: FlexItemOptions;
  /** The clip's own time window, seconds (named `start` here — `at` above is the frame position). */
  start?: number;
  dur?: number;
}

export interface BackdropOptions {
  colors?: readonly [HexColor, HexColor];
  opacity?: number;
  seed?: number;
}

export interface GlowOptions {
  size?: number;
  alpha?: number;
  color?: HexColor;
  [field: string]: unknown;
}

export interface FlashOptions {
  at?: number;
  dur?: number;
  peak?: number;
  color?: HexColor;
}

export interface KickerOptions {
  x?: number;
  y?: number;
  at?: number;
  dur?: number;
  size?: number;
  weight?: number;
  color?: HexColor;
  font?: string;
  parent?: string;
  [field: string]: unknown;
}

export interface PillOptions {
  size?: number;
  weight?: number;
  color?: HexColor;
  fillColor?: HexColor;
  stroke?: string;
  dot?: Fill;
  shadow?: boolean;
  padX?: number;
  padY?: number;
  name?: string;
  x?: number;
  y?: number;
  anchor?: Anchor;
  at?: number;
  dur?: number;
  font?: string;
  parent?: string;
}

export interface StreaksOptions {
  count?: number;
  colors?: readonly HexColor[];
  name?: string;
  rotationDeg?: number;
  opacity?: number;
}

export interface FinishOptions {
  vignette?: number;
  softness?: number;
  grain?: number;
  seed?: number;
  saturation?: number;
  contrast?: number;
  [field: string]: unknown;
}

/**
 * A `component()` descriptor. `props` maps a name to `{type, default,
 * description?}`; `duration` (seconds) is the piece's own natural length.
 */
export interface ComponentPropSpec<T extends string | number | boolean = string | number | boolean> {
  type: "string" | "number" | "color" | "boolean";
  default: T;
  description?: string;
}

export interface ComponentSpec {
  props?: Record<string, ComponentPropSpec>;
  duration?: number;
}

export interface CompositionParam {
  type: "string" | "number" | "color" | "boolean";
  default: string | number | boolean;
  path: string;
  description?: string;
}

export interface SaveAsCompositionOptions {
  width: number;
  height: number;
  fps: number;
  palette?: Palette;
  fonts?: Record<string, string>;
  name?: string;
  description?: string;
}

export interface SaveAsCompositionResult {
  composition_id: string;
  source_timeline_id: string;
  /** Props left out of the saved composition — reached no single field, or reached more than one. */
  skippedParams: string[];
  [field: string]: unknown;
}

/** Minimal shape of the `nodetool.timelines` belt object `video()`/`component()` need — see the pack's SKILL.md `Saving` section for the full surface. */
export interface TimelinesBelt {
  validate(target: unknown, opts?: Record<string, unknown>): Promise<{ ok: boolean; errors?: unknown[]; warnings?: unknown[] }>;
  create(name: string, opts?: Record<string, unknown>): Promise<{ timeline_id: string }>;
  setDocument(id: string, document: unknown): Promise<{ written: boolean; validation?: unknown; error?: unknown }>;
  edit(id: string, ops: unknown[]): Promise<{ failed: boolean; ops: Array<{ ok: boolean }> }>;
  compositions: {
    save(
      timelineId: string,
      groupTarget: string,
      name: string,
      params: Record<string, CompositionParam>,
      opts?: { description?: string }
    ): Promise<{ composition_id: string }>;
  };
  [member: string]: unknown;
}

export interface Component<Props extends Record<string, unknown> = Record<string, unknown>> {
  readonly __component: true;
  readonly name: string;
  readonly props: Record<string, ComponentPropSpec>;
  readonly duration?: number;
  readonly build: (s: SceneApi, props: Props) => void;
  saveAsComposition(timelines: TimelinesBelt, o: SaveAsCompositionOptions): Promise<SaveAsCompositionResult>;
}

export interface UseOptions {
  at?: number;
  dur?: number;
  name?: string;
  parent?: string;
  x?: number;
  y?: number;
}

/** Everything a scene builder function (`v.scene`'s `fn`, `s.seq`'s `fn`) receives. */
export interface SceneApi {
  text(str: string, o?: TextOptions): Clip;
  rect(w: number, h: number, fill: Fill, o?: ShapeOptions): Clip;
  ellipse(d: number, fill: Fill, o?: ShapeOptions): Clip;
  path(points: PathPoints, o?: PathOptions): Clip;
  image(assetId: string, o?: ClipFieldOptions): Clip;
  video(assetId: string, o?: MediaOptions): Clip;
  audio(assetId: string, o?: MediaOptions): Clip;
  group(o?: ClipFieldOptions): Clip;
  adjust(effects: unknown[], o?: AdjustOptions): Clip;
  fill(color: HexColor, o?: ClipFieldOptions): Clip;
  stack(children: readonly Clip[], o?: ContainerOptions): Clip;
  row(children: readonly Clip[], o?: ContainerOptions): Clip;
  center(child: Clip, o?: { at?: { x: number; y: number } | "center" }): Clip;
  seq<T>(atSec: number, durSec: number, fn: (q: SceneApi) => T): T;
  stagger<T extends Clip>(items: readonly T[], offsetSec: number, fn: (item: T, index: number) => void): void;
  backdrop(o?: BackdropOptions): Clip;
  glow(o?: GlowOptions): Clip;
  flash(o?: FlashOptions): Clip;
  kicker(str: string, o?: KickerOptions): Clip;
  pill(label: string, o?: PillOptions): Clip;
  streaks(o?: StreaksOptions): Clip;
  finish(o?: FinishOptions): Clip;
  noise(seed?: number): (x: number) => number;
  /**
   * Instantiate a `component()` descriptor: folds its build's clips into one
   * group. `propsIn` is checked and defaulted against `Comp.props`, throwing
   * and naming the offending prop.
   */
  use<Props extends Record<string, unknown>>(Comp: Component<Props>, propsIn?: Partial<Props>, o?: UseOptions): Clip;
  /** Loose pending precise typing (see `charts.js`). */
  barChart(data: unknown, o?: Record<string, unknown>): Clip;
  lineChart(series: unknown, o?: Record<string, unknown>): Clip;
  areaChart(series: unknown, o?: Record<string, unknown>): Clip;
  donut(data: unknown, o?: Record<string, unknown>): Clip;
  statCounter(value: unknown, o?: Record<string, unknown>): Clip;
}

export interface Palette {
  ink?: HexColor;
  ink2?: HexColor;
  text?: HexColor;
  dim?: HexColor;
  accent?: HexColor;
}

export interface VideoOptions {
  width: number;
  height: number;
  fps: number;
  palette?: Palette;
  fonts?: Record<string, string>;
}

export type TransitionType =
  | "wipe" | "whip" | "iris" | "gradientWipe" | "crossfade" | "push"
  | "slide" | "zoom" | "zoomBlur" | "glitch" | "dipToColor" | "lightLeak";

export interface TransitionItem {
  readonly __transition: true;
}

export interface Scene {
  readonly name: string;
  readonly id: string;
  readonly durationMs: number;
}

export type MidiInstrumentPreset = "bl1-acid" | "dr1-tr-void" | (string & {});

export interface MidiOptions {
  at?: number;
  dur?: number;
  instrument?: MidiInstrumentPreset | Record<string, unknown>;
  name?: string;
}

export interface AudioOptions {
  at?: number;
  dur?: number;
  trackId?: string;
  trackName?: string;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  mute?: boolean;
  [field: string]: unknown;
}

export interface AdjustTopLevelOptions {
  at?: number;
  dur?: number;
  id?: string;
  name?: string;
  trackId?: string;
  animations?: unknown[];
}

export interface BeatsOptions {
  bpm: number;
  offset?: number;
  count?: number;
  snap?: readonly string[];
  timeSignature?: { beatsPerBar: number; beatUnit: number };
}

export interface SaveOptions {
  name: string;
  showcase?: boolean;
  ops?: unknown[];
}

export interface SaveResult {
  timeline_id: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  errors: unknown[];
  warnings: unknown[];
}

/** `v.midi`'s `[beat, pitch, lenBeats?, velocity?]` tuples — musical time, not seconds. */
export type MidiNoteTuple = readonly [beat: number, pitch: number, lenBeats?: number, velocity?: number];

/** The `v` object `video({...})` returns. */
export interface VideoBuilder {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Set once `series()` has run. */
  durationMs: number;

  scene(name: string, durationSec: number, fn: (s: SceneApi) => void, extra?: Record<string, unknown>): Scene;
  transition(type: TransitionType, durationSec: number, opts?: Record<string, unknown>): TransitionItem;
  series(items: ReadonlyArray<Scene | TransitionItem>): VideoBuilder;
  adjust(effects: unknown[], o?: AdjustTopLevelOptions): Clip;
  audio(assetId: string, o?: AudioOptions): Clip;
  music(assetId: string, o?: AudioOptions): Clip;
  midi(trackId: string, notes: readonly MidiNoteTuple[], o?: MidiOptions): Clip;
  beats(o: BeatsOptions): unknown[];
  document(fields: { camera2d?: unknown; trackFolders?: unknown; tempo?: unknown }): VideoBuilder;
  save(timelines: TimelinesBelt, o: SaveOptions): Promise<SaveResult>;
}

export function video(o: VideoOptions): VideoBuilder;

/**
 * `component(name, {props, duration}, (s, props) => {...})` — a reusable
 * scene piece, used with `s.use(Comp, {...props}, {at, dur})`.
 */
export function component<Props extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  spec: ComponentSpec,
  build: (s: SceneApi, props: Props) => void
): Component<Props>;

export function noise(seed?: number): (x: number) => number;
export function rad(degrees: number): number;
export function hash(n: number): number;
export function ease(name: EaseName): string;

export const MIDI_PPQ: number;

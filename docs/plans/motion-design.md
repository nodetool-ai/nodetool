# Motion Design for the Timeline — Technical Design

Status: approved design, not yet implemented.
Companion doc: [motion-design-tasks.md](motion-design-tasks.md) (implementation plan, agent-consumable tasks).

## Goal

Jitter-style motion design inside the existing timeline editor: clips animate —
slide in, pop, drift, loop — without the user placing keyframes. The authoring
unit is a **named animation preset** attached to a clip (`fadeIn`, `slideIn`,
`kenBurns`, …) with duration, delay, easing, and a few parameters. The primary
authoring surface is the **agent**: a user says "make the title pop in and
float", the agent applies animations via `ui_timeline_*` tools, previews the
result frame-by-frame, and adjusts. Manual UI (inspector panel, clip badges) is
a thin layer over the same data.

Presets compile to an internal keyframe/curve form evaluated by one sampler, so
a curve editor or per-keyframe tools can be added later without a schema break.

## Current state

The timeline is a non-linear cut editor. Nothing varies over time except
crossfades, audio fades, and playback speed.

| Concern | Where it lives today |
|---|---|
| Data model | `packages/timeline/src/types.ts` — `TimelineSequence`, `TimelineTrack`, `TimelineClip`. Clips carry a **static** `transform?: ClipTransform` (position px from canvas center, scale multiplier on contain-fit, rotation radians, anchor normalized), `opacity`, `effects[]`, `transitionIn` (crossfade), `fadeInMs`/`fadeOutMs` (audio-only, applied in `web/src/components/timeline/preview/AudioGraph.ts`). |
| Scene resolution | `web/src/components/timeline/preview/sceneModel.ts` — pure `computeActiveLayersWithHorizon(tracks, clips, currentTimeMs)` returns `ActiveLayer[]` plus `nextChangeMs`, the change horizon that lets the rAF loop skip recomputation between boundaries. |
| Live preview | `web/src/components/timeline/preview/PreviewCompositor.tsx` + `preview/gpu/` (WebGPU with Canvas2D fallback; affine math in `preview/gpu/transform.ts`). |
| Export | `web/src/components/timeline/render/TimelineRenderer.ts` — steps in exact 1/fps increments, composites via the **same** scene model and GPU compositor, encodes MP4 via WebCodecs (`mediabunny`). Server ffmpeg path (`packages/video-nodes/src/nodes/timeline.ts`) is an explicit rough cut and stays one. |
| Edit ops | `packages/timeline/src/splitClip.ts`, `trimClip.ts` (pure); Zustand `web/src/stores/timeline/TimelineStore.ts` (`patchClip(clipId, patch)`), temporal undo/redo. |
| Persistence | `TimelineDocument` JSON blob in `timeline-sequences` (`packages/models/src/timeline-sequence.ts`); zod wire schema `packages/protocol/src/api-schemas/timeline.ts`. **Fields absent from the zod schema are stripped on PATCH.** |
| Agent surface | `web/src/lib/tools/builtin/timeline.ts` (13 `ui_timeline_*` tools) → `TimelineAgentHandler` interface in `web/src/components/timeline/timelineAgentBridge.ts`, implemented by `web/src/hooks/timeline/useTimelineAgentBridge.ts`. `ui_timeline_get_clip_frames` already lets the agent see rendered frames. |

## Data model

New module: `packages/timeline/src/animation/` (pure, no DOM/GPU/store access),
re-exported from `packages/timeline/src/index.ts`.

```ts
// packages/timeline/src/animation/types.ts

export type AnimationRole = "in" | "out" | "emphasis" | "loop";

export type EasingId =
  | "linear"
  | "easeIn" | "easeOut" | "easeInOut"        // cubic
  | "easeOutBack"                              // overshoot (pop)
  | "easeOutElastic"
  | "easeOutBounce";

export interface ClipAnimation {
  id: string;                 // crypto.randomUUID() at creation
  role: AnimationRole;
  preset: AnimationPresetId;  // union of catalog ids, see below
  /** Animation length in ms. For "loop", the period of one cycle. */
  durationMs: number;
  /**
   * "in" | "emphasis" | "loop": offset from clip start to window start.
   * "out": offset from clip END back to window end (0 = ends exactly at clip end).
   * Default 0.
   */
  delayMs?: number;
  easing?: EasingId;          // default per preset
  /** Default true. Disabled animations are kept but not evaluated. */
  enabled?: boolean;
  /** Preset-specific knobs; unknown keys ignored. See catalog. */
  params?: Record<string, number | string | boolean>;
}
```

`TimelineClip` gains one optional field (after `transitionIn`):

```ts
  /** Motion-design animations evaluated at render time. Order matters only
   *  within a role; roles compose deterministically (see animation/sample.ts). */
  animations?: ClipAnimation[];
```

### Compiled form (internal substrate)

Presets never render directly; they compile to curves. This is the extension
point for a future curve editor and for baked custom motion.

```ts
// packages/timeline/src/animation/compile.ts

export type AnimatedProperty =
  | "offsetX" | "offsetY"   // canvas px, resolved from normalized preset units
  | "scale"                 // uniform multiplier on ClipTransform.scale
  | "rotation"              // radians, added to ClipTransform.rotation
  | "opacity";              // multiplier on the layer's resolved opacity

export interface Keyframe { t: number; value: number; easing?: EasingId }
// t normalized 0..1 within the animation window; keyframes sorted by t;
// first t === 0, last t === 1.

export interface PropertyCurve { property: AnimatedProperty; keyframes: Keyframe[] }

export interface CompiledAnimation {
  role: AnimationRole;
  windowStartMs: number;   // clip-local, resolved from role + delay + duration
  windowEndMs: number;
  loop: boolean;           // role === "loop": repeat until clip end
  /** Hold curve endpoint values outside the window (in: hold t=0 before window;
   *  out: hold t=1 after window). false → identity outside the window. */
  holdBefore: boolean;     // true for "in"
  holdAfter: boolean;      // true for "out"
  curves: PropertyCurve[];
}

/** Pure. canvas = sequence {width, height}; clipDurationMs for window math. */
export function compileClipAnimations(
  animations: ClipAnimation[],
  clipDurationMs: number,
  canvas: { width: number; height: number }
): CompiledAnimation[];
```

Preset position units are normalized (fraction of canvas width/height) inside
the catalog; `compileClipAnimations` resolves them to px so the sampler and GPU
stay unit-free.

### Sampler

```ts
// packages/timeline/src/animation/sample.ts

export interface AnimationSample {
  offsetX: number;  // px, add to transform.position.x
  offsetY: number;
  scale: number;    // multiply transform.scale.x and .y
  rotation: number; // radians, add to transform.rotation
  opacity: number;  // 0..1, multiply layer opacity
}

export const IDENTITY_SAMPLE: AnimationSample; // {0, 0, 1, 0, 1}

/** Pure. localMs = currentTimeMs - clip.startMs. */
export function sampleAnimations(
  compiled: CompiledAnimation[],
  localMs: number
): AnimationSample;
```

Composition rules (deterministic, order-independent across roles):

- Evaluate every compiled animation independently, then fold: offsets and
  rotation **add**, scale and opacity **multiply**.
- Within a window: map `localMs` to normalized `t`, find the bracketing
  keyframes, apply the segment's easing (the easing stored on the *right*
  keyframe of the segment; `ClipAnimation.easing` overrides every segment),
  lerp.
- `"in"` before its window: hold the `t=0` value — a delayed `fadeIn` keeps the
  clip invisible during the delay. After the window: identity.
- `"out"` after its window: hold the `t=1` value (clip stays out). Before:
  identity.
- `"emphasis"` outside its window: identity.
- `"loop"`: identity before `windowStartMs`; from there, `t = ((localMs - start)
  % durationMs) / durationMs` until clip end. Loop curves must start and end at
  the same value to avoid pops (catalog invariant, asserted in tests).
- Speed (`speedMultiplier`) does **not** rescale animation time: animations run
  on the timeline clock, not the source clock. (Matches how fades and
  crossfades behave today.)

## Preset catalog v1

`packages/timeline/src/animation/presets.ts`. Each entry: id, allowed roles,
default duration/easing, params with defaults, and a curve generator
`(params, canvas) => PropertyCurve[]`. `AnimationPresetId` is the union of ids.

| Preset | Roles | Params (defaults) | Motion |
|---|---|---|---|
| `fade` | in, out | — | opacity 0↔1 |
| `slide` | in, out | `direction: "left"\|"right"\|"up"\|"down"` ("left"), `distance` (0.3 = fraction of canvas) | offset from/to direction, opacity 0↔1 |
| `pop` | in, out | `overshoot` (1.08) | scale 0.6↔1 with `easeOutBack`, opacity 0↔1 |
| `spin` | in, out | `turns` (0.25) | rotation ±turns·2π, opacity 0↔1 |
| `wipe` | — | — | **deferred** — needs per-layer masking in the compositor; not in v1 |
| `pulse` | emphasis | `intensity` (0.06) | scale 1→1+i→1 |
| `shake` | emphasis | `intensity` (0.02), `cycles` (4) | offsetX zig-zag, fraction of canvas width |
| `bounce` | emphasis | `height` (0.05) | offsetY dip with `easeOutBounce` |
| `kenBurns` | loop | `zoom` (0.12), `direction` ("in"), `driftX`/`driftY` (0.02) | slow scale 1→1+z (or reverse) + drift. Curve is monotonic; exempt from the loop start==end invariant via `loop:false` compile (it runs once over the whole clip: window = full clip, holdAfter true) |
| `float` | loop | `amplitude` (0.015), `periodMs` via durationMs | offsetY sine bob (piecewise-cubic approximation over ≥8 keyframes) |
| `breathe` | loop | `intensity` (0.03) | scale sine |
| `rotate` | loop | `rpm` via durationMs | rotation 0→2π per cycle |

Defaults: `in`/`out` 500 ms, `emphasis` 600 ms, `loop` 3000 ms. `in` defaults
to `easeOut`, `out` to `easeIn`, others per table.

## Rendering integration

The layer *set* stays cacheable; animated *properties* are resolved per frame.
`computeActiveLayersWithHorizon` and its change-horizon contract are untouched
— animation windows never add or remove layers, so `nextChangeMs` stays
correct for set membership.

New pure helper (in `sceneModel.ts`, since it is shared preview/export
vocabulary):

```ts
export interface AnimatedLayerProps { transform?: ClipTransform; opacity: number }

/** Compose a layer's static transform/opacity with its animation sample at t.
 *  Returns the inputs unchanged when the clip has no enabled animations. */
export function resolveAnimatedLayerProps(
  layer: ActiveLayer,
  currentTimeMs: number,
  canvas: { width: number; height: number },
  cache?: AnimationCompileCache            // keyed by clip id + animations ref
): AnimatedLayerProps;
```

Call sites (the only two, keeping 1:1 preview/export parity):

1. **Live preview** — `PreviewCompositor.tsx`, where each `ActiveLayer`'s
   `transform`/`opacity` is handed to the GPU layer list. While any active
   layer has an enabled animation whose window (or loop tail) covers the
   current time, the compositor must redraw every rAF tick even when paused-
   idle short-circuits would otherwise skip drawing — expose
   `hasActiveAnimation(layers, timeMs)` next to the resolver for that check.
2. **Export** — `render/TimelineRenderer.ts`, same resolver per stepped frame.
   No other change: WebCodecs encode path is agnostic.

Composition into `ClipTransform` (identity when clip has none:
`position {0,0}, scale {1,1}, rotation 0, anchor {0.5,0.5}`):

```
position.x += sample.offsetX      scale.x *= sample.scale
position.y += sample.offsetY      scale.y *= sample.scale
rotation   += sample.rotation     opacity  *= sample.opacity
```

`sample.opacity` multiplies the already-resolved layer opacity (base ×
crossfade), so animations compose with `transitionIn` rather than fighting it.
Caption layers (`kind: "caption"`) get the same treatment — they carry the
clip's transform already.

Compilation is memoized per clip (`WeakMap` on the `animations` array ref, or a
`Map<clipId, {ref, compiled}>`) — the per-frame cost is sampling only:
a handful of lerps per animated layer, no allocation in the steady state
(sampler writes into a scratch `AnimationSample`).

## Persistence

- `TimelineDocument` is a JSON blob — **no DB migration**. Old documents lack
  `animations`; every consumer treats `undefined` as "no animations".
- **Required:** add `animations` to the clip zod schema in
  `packages/protocol/src/api-schemas/timeline.ts` (see the existing
  `storyboardBoardId` comment in `types.ts`: fields missing from the schema are
  stripped by PATCH). Use a permissive
  `z.array(clipAnimation)` with `preset: z.string()` (not the enum) so older
  servers don't reject documents from newer clients; unknown presets are
  skipped at compile time with a console warning.
- Autosave/undo need no changes: `patchClip` flows through the temporal
  middleware like any clip field.

## Editing semantics

Implemented where the pure ops live (`packages/timeline/src/`):

- **`splitClip`**: left half keeps `role: "in"` animations, right half keeps
  `"out"`; `"emphasis"` and `"loop"` are copied to both halves (loop windows
  re-derive naturally from each half's duration). Ids on the right half are
  regenerated.
- **`trimClip` / duration changes**: windows are clamped at sample time
  (`compileClipAnimations` clamps `windowEndMs` to `clipDurationMs`, and drops
  a window whose start ≥ clip duration), so trims need no data rewrite.
  When in+out overlap because the clip got too short, both still evaluate;
  fold rules keep the result continuous.
- **`duplicateClip`**: copies `animations` with fresh ids.
- **Linked clips / speed / bake**: no interaction — animations live on the
  timeline clock.

## Agent surface

Extend `TimelineAgentHandler`
(`web/src/components/timeline/timelineAgentBridge.ts`, implemented in
`web/src/hooks/timeline/useTimelineAgentBridge.ts`) and register three tools in
`web/src/lib/tools/builtin/timeline.ts`:

- **`ui_timeline_animate_clip`** — `{ target, animations: ClipAnimationInput[],
  mode?: "add" | "replace" }` (`replace` default; `add` appends). Each input:
  `{ role, preset, durationMs?, delayMs?, easing?, params? }` — ids and
  defaults filled in by the handler. Returns the updated clip including
  resolved animations. Validation errors (unknown preset, role not allowed for
  preset) return `ok: false` with the catalog row so the agent self-corrects.
- **`ui_timeline_clear_animations`** — `{ target, role? }`.
- **`ui_timeline_list_animation_presets`** — no args; returns the catalog
  (id, roles, params with defaults and ranges, one-line description, default
  duration/easing). This is the runtime vocabulary discovery; tool descriptions
  carry a compact summary so simple requests skip the extra call.

Also: include `animations` in `getSnapshot()` clip entries so
`ui_timeline_get_state` shows current motion.

The critique loop needs no new tools: `ui_timeline_get_clip_frames` +
`ui_timeline_seek` already exist. Tool descriptions should state the intended
loop: *get state → animate → get frames at window boundaries → adjust*.

## Manual UI (thin, after the agent surface)

- **Inspector**: an "Animate" section in
  `web/src/components/timeline/Inspector/` (pattern:
  `ClipAdjustments.tsx`, primitives from `InspectorPrimitives.tsx`). Per role:
  preset select, duration, delay, easing, preset params. `ui_primitives` only;
  `SPACING`/`TYPOGRAPHY`/`MOTION` tokens (see `docs/DESIGN.md`).
- **Clip chips**: in `web/src/components/timeline/Tracks/Clip.tsx`, small
  in/out zone markers (left/right wedge spanning the window width at current
  zoom) and a loop glyph — read-only affordance, click selects the clip and
  opens the inspector section.

## Phase 2 — text and shape clips

Jitter is mostly motion typography; this design animates whatever a clip can
draw, so text arrives as a new clip kind, not an animation change:

- `mediaType: "text"` on `TimelineClip` + `textStyle?: ClipTextStyle`
  (content, font family/size/weight, fill, alignment, max width fraction).
- Rendered as a rasterized layer: reuse the caption rasterization approach
  (`preview/captionRender.ts`) — draw to an offscreen canvas at sequence
  resolution × device scale, hand the bitmap to the compositor as an image
  source keyed by a style hash. Animation then applies for free via the same
  `resolveAnimatedLayerProps`.
- Agent tool `ui_timeline_add_text_clip`.
- Shapes (rect/ellipse/line) follow the same rasterize-to-layer pattern later.

## Non-goals

- **Lottie/GIF export** — MP4 via the existing WebCodecs path only.
- **Curve editor UI / dope sheet** — the compiled-curve substrate exists for
  it, but no UI in this effort.
- **Server-side render parity** — the ffmpeg rough cut ignores animations,
  exactly as it ignores effects and transitions today.
- **Per-property keyframe authoring by agents** — presets + params only until
  real demand appears.
- **Animating GPU effect parameters** (blur amount, color grade) — the
  substrate allows adding `AnimatedProperty` values later; v1 is transform +
  opacity.

## Testing

- `packages/timeline/src/animation/__tests__/` (Vitest): easings (endpoint +
  monotonicity), window math for every role incl. delays and clamping, sampler
  fold rules, loop wraparound and start==end invariant, split/trim semantics,
  compile determinism.
- `web/src/components/timeline/preview/__tests__/` (Jest): `resolveAnimatedLayerProps`
  composition against hand-computed frames; `hasActiveAnimation` horizon
  behavior; export/preview parity by sampling both paths at the same t.
- Visual: one debug-harness / Playwright pass rendering a seeded sequence with
  each preset at t = window midpoints, snapshot-compared (existing
  `web/tests/` visual patterns).

## Risks

- **Paused-preview redraw**: missing the `hasActiveAnimation` redraw hook makes
  animations invisible while scrubbing paused. Caught by the Jest parity test.
- **Schema strip**: forgetting the protocol zod field silently loses animations
  on save. Caught by a round-trip test in the protocol package.
- **Perf**: per-frame sampling is O(active animated layers × curves); with
  memoized compilation this is negligible next to video decode. Do not compile
  in the rAF loop.

# Motion Graphics — Implementation Plan

Companion to [motion-graphics.md](motion-graphics.md) (the technical design).
Every task below is written to be executed by an agent **with no prior
conversation context**. Each task's first step is: read
`docs/plans/motion-graphics.md` in full. It is the contract; this file adds
sequencing, file-level pointers, and acceptance criteria. Finding codes
(`F1`…), assumptions (`AS`), invariants (`I`), constraints (`C`) and
decisions (`D`) refer to that document.

## Ground rules for every task

- Repo root is a TypeScript monorepo. `nvm use && npm install` if
  `node_modules` is missing (sandboxed environments: `npm install
  --ignore-scripts`, see `AGENTS.md` § Install in sandboxed environments).
- Work on a branch named `motion/<task-id>-<slug>`. One task per PR. Title
  the PR `feat(timeline): <task title> [<task-id>]` and list the finding
  codes the PR resolves in its body.
- After changes, run and paste the results into the PR:

  ```bash
  npm run test:affected
  npm run typecheck
  npm run lint
  npm run dev:nodetool -- harness gate --base main
  ```

  A task that adds a capability also runs `npm run capabilities:sync` and
  `npm run capabilities:check` (I10).
- **Schema mirror (I1).** Any field you add to `packages/timeline/src/types.ts`
  must exist in `packages/protocol/src/api-schemas/timeline.ts` and be covered
  by the round-trip test in `packages/execution/tests/` (T1 creates it). If
  T1 has landed, the field already exists; do not re-add it.
- **`packages/timeline` root stays dependency-free (AS2).** Render code lives
  under `src/render`. `packages/agents` imports `@nodetool-ai/timeline/scene`
  only (C5).
- **Every new check proves it can fail (I12).** A validator code ships with a
  fixture that triggers it; an eval predicate ships with a state that fails it.
- Web UI: primitives from `web/src/components/ui_primitives/` only, tokens per
  `docs/DESIGN.md`. Never import raw MUI.
- Prose in docs and skills follows `docs/WRITING_STYLE.md`.
- Do not widen a task. If you find an adjacent bug, file it in the PR body
  under "Found, not fixed" and move on.
- Commit messages: conventional, imperative, body says why.

## Model key

- **Opus** — design-sensitive core: scene model, compositors, schema landing,
  agent contracts, skill prose.
- **Sonnet** — well-specified implementation against a landed schema.

Every task below is written for Opus unless marked otherwise; the ones marked
Sonnet-capable have an exact spec and no open design choice.

## Dependency graph

```
M0  T1 ─┬─► T2   T3   T4   T5                     (T2–T5 parallel, need T1 only for T4)
M1  T1 ─┴─► T6 ──► T7 ──► T8
M2  T7 ──► T9 ──► T10          T9 ──► T11         T9 ──► T12         T7 ──► T13
M3  T1 ──► T14   T15   T16     T17 (independent)
M4  T4+T9+T11+T12+T13 ──► T19   T1 ──► T18   T20   T9+T18 ──► T21   T3 ──► T22
    T22 ──► T23   T19+T21+T22+T23 ──► T24 ──► T25   T19 ──► T26
M5  T3 ──► T27   T7 ──► T28   T7 ──► T29   T9..T16 ──► T30   T7..T16 ──► T31
```

**Serial chain through the compositors (R4):** T7 → T9 → T10 → T11 → T12 →
T13 → T28 each touch `sceneModel.ts`, `canvas2d.ts` and `frameCompositor.ts`.
Run them one at a time, rebasing on the previous merge. Everything else can
run in parallel with that chain.

**Files shared by many tasks, land early:** `packages/timeline/src/types.ts`
and `packages/protocol/src/api-schemas/timeline.ts` (T1 only), the validator
(T30 collects codes; feature tasks may add their own code when the fixture is
trivial, and T30 reconciles), `timelines.specs.ts` (T18–T23 each add specs;
rebase conflicts are additive).

---

## Milestone 0 — Unblock and correct

### T1 — Schema landing · **Opus**

**Resolves:** prerequisite for every field-adding task. Decision D1.

**Goal:** add every new optional field named in
`motion-graphics.md` § Document model to the TypeScript types and the Zod
schema in one PR, with no behavior change and one round-trip test per field.

**Read first:** `packages/timeline/src/types.ts`,
`packages/protocol/src/api-schemas/timeline.ts` (note the "Without this field
Zod strips it" comments; they are the convention),
`packages/execution/src/timeline-debug/validate.ts` (`checkFieldStripping`).

**Change:**

- `types.ts`: `parentId`, `mask: ClipMask`, `matte: ClipMatte`, the widened
  `ClipTransition` union, the widened `ClipEffect` union, `timeRemap`,
  `compositionId`, `compositionParams`, `ClipTextStyle` additions,
  `ClipShapeStyle` additions, `ShapeFill`, `CaptionStyle` on `ClipCaption`,
  `mediaType: "group"`. Mirror every new type into the Zod file as a
  `z.object` with the same optionality, with a one-line comment on each
  field that would otherwise be stripped.
- `ANIMATED_PROPERTIES` in `animation/types.ts`: add the channel names from
  the design (`scaleX`, `scaleY`, `contrast`, `hue`, `temperature`, `tint`,
  `positionX`, `positionY`, `anchorX`, `anchorY`, `trimStart`, `trimEnd`).
  Add a parallel `ANIMATED_PROPERTY_FOLD: Record<AnimatedProperty, "add" |
  "multiply" | "replace" | "min">`. Do not change `sample.ts` (T7 does).
- Do not add behavior. Compilers, samplers, compositors and the validator
  must ignore the new fields.

**Tests:**

- `packages/execution/tests/timeline-schema-roundtrip.test.ts`: build one
  document that sets every new field to a non-default value, parse through
  `timelineDocument`, and assert `checkFieldStripping` returns no issue.
  Then delete one field from the Zod schema in a `vi.mock` and assert the
  test fails (prove the check bites, I12), restore.
- `packages/protocol` type test that `z.infer<typeof timelineClip>` is
  assignable to `TimelineClip` and back for the new fields.

**Acceptance:** typecheck, lint, `npm run test --workspace=packages/timeline`,
`--workspace=packages/protocol`, `--workspace=packages/execution` green;
the round-trip test enumerates every field in the design's model section (list
them in the PR body as a table: field, TS line, Zod line).

### T2 — F16 caption fields and F17 dropped-layer report · **Sonnet**

**Resolves:** F16, F17.

**Change:**

- Zod `captionWord` gains `kind: z.enum(["word","filler","pause"]).optional()`
  and `confidence: z.number().min(0).max(1).optional()`.
- `computeActiveLayersWithHorizon` returns `droppedLayers: { clipId: string;
  reason: "video_layer_cap" }[]` in `ActiveLayersResult`. `preview_timeline_frame`
  (`packages/agents/src/timeline-preview/frames.ts`) surfaces them per frame
  under `dropped`. The validator emits `layer_cap_exceeded` (warning) when any
  instant has more than `MAX_VIDEO_LAYERS` simultaneous video clips; compute
  from clip windows, not by sampling.

**Tests:** round-trip fixture with `kind: "filler"` survives parse
(`packages/execution/tests/`); a nine-video-clip fixture reports one dropped
layer from the scene model and one `layer_cap_exceeded` from the validator.

**Acceptance:** `web/src/stores/timeline/transcriptOps.ts` filler removal
works after a save round trip (add a store test).

### T3 — Server render through Dawn on every profile · **Opus**

**Resolves:** F10, F14 (progress and cancel half). Decision D9.

**Read first:** `scripts/bundle-backend.mjs` (`DESKTOP_ONLY_EXTERNAL_PACKAGES`,
`REQUIRED_EXTERNAL_PACKAGES`), `scripts/verify-backend-bundle.mjs`
(`requireWebgpu`), `Dockerfile` (mesa-vulkan-drivers block),
`packages/gpu/src/node.ts` (instance retention, R2),
`packages/video-nodes/src/nodes/timeline.ts`,
`packages/video-nodes/src/nodes/timeline/compositeRender.ts`,
`.github/workflows/quality-checks.yml` (the `docker` leg, `scripts/docker-smoke.mjs`).

**Change:**

- Move `webgpu` from `DESKTOP_ONLY_EXTERNAL_PACKAGES` to the common required
  list; `verifyBackendBundle` requires it on both profiles. Update the
  comments in both scripts and the Dockerfile that say the server ships
  without it, and the header of `timeline.ts`.
- `RenderTimelineNode.process`: pass `onProgress` that posts
  `{ type: "node_progress", node_id: this.id, progress: frame, total:
  totalFrames }` through `context.postMessage` at most four times a second;
  pass the run's abort signal into `renderTimelineComposited`, which checks
  it once per frame and throws an `AbortError`.
- When the compositor is unavailable, log a `warning` level job log naming
  the fallback and the reason, and set `output.metadata.render_mode =
  "rough_cut"`; on the composited path set `"composited"`.
- `scripts/docker-smoke.mjs`: after the health check, POST a one-node
  `RenderTimeline` workflow with a two-clip fixture (a text clip over a
  solid shape) and assert the job's `render_mode` is `"composited"`. This
  is the check that proves the image renders.

**Tests:** `packages/video-nodes/tests/timeline-render.test.ts` runs
`renderTimelineComposited` on a fixture with lavapipe (`VK_DRIVER_FILES`, see
AGENTS.md § WebGPU on a headless machine) and asserts progress callbacks
arrive in order and an aborted signal stops before `totalFrames`. Skip only
when no adapter exists, and print why.

**Acceptance:** the Quality Gate `docker` leg passes with the new smoke
assertion. `npm run backend:smoke` passes on the server profile.

### T4 — Custom animation op for agents · **Opus**

**Resolves:** F19. Decision D2.

**Read first:** `packages/timeline/src/animation/custom.ts`,
`packages/agents/src/custom-animation-bake.ts`,
`packages/agents/src/evals/surfaces/timeline.ts` (`animate_clip` in the
bridge, the `Unknown animation preset` throw),
`packages/agents/src/capabilities/timelines.ts` (`edit_timeline`),
`packages/agents/src/capabilities/timelines.specs.ts`,
`docs/timeline-custom-animations.md`.

**Change:**

- Bridge `animate_clip` accepts `preset: "custom"` with exactly one of
  `curves` (inline `{property, keyframes:[{t, value, easing?}]}[]`) or
  `code` (a JS body). With `curves`, run `normalizeCustomCurves` and store
  `custom: {curves, bakedAt}`. With `code`, call `bakeCustomAnimation` with
  the clip's window and canvas size, store `custom: {code, curves,
  bakedAt}`. Any other preset keeps today's catalog check. `mask` is
  required when a curve drives `wipeProgress`, else refused with the message
  from `custom.ts`.
- The browser `ui_timeline_animate_clip` schema
  (`web/src/lib/tools/builtin/timeline.ts`) and the headless `edit_timeline`
  op schema (`timelines.specs.ts`) both gain `curves` and `code`.
- `list_animation_presets` lists `custom` with its input contract and the
  `ANIMATED_PROPERTIES` names and ranges.
- Extend `docs/timeline-custom-animations.md` with the agent path.

**Tests:** `packages/agents/tests/timelines-op-input.test.ts` cases for
`curves` accepted, `code` baked, both refused, neither refused, unknown
property refused with the property list in the message. `timeline-tool-loop`
eval case `keyframed-slide` (deterministic assertions on the stored curves).

**Acceptance:** an `edit_timeline` call with a two-keyframe `opacity` curve
renders through `preview_timeline_frame` at mid-curve with the interpolated
opacity (add to `capabilities-timeline-preview.test.ts`, read the pixel).

### T5 — Frame preview in the CodeAct object model · **Sonnet**

**Resolves:** F22 (namespace half).

**Change:** `packages/agents/src/codeact/nodetool-api.ts`: add
`"preview_timeline_frame"` to the `timelines` namespace list and
`timelines.preview(target, opts)` to the object model, taking an id or an
inline document like `validate`. Update the generated typings and the
sandbox manifest (`packages/agents/src/code-gen/sandbox-manifest.ts`) where
the namespace is documented.

**Tests:** the existing object-model test that enumerates namespaces; add
`preview` to it.

---

## Milestone 1 — Animation depth

### T6 — Easing grammar: cubic bezier and spring · **Opus**

**Resolves:** F2. Decision D3.

**Read first:** `packages/timeline/src/animation/easing.ts`,
`animation/types.ts` (`EasingId`), `animation/compile.ts` (where easing is
applied per segment), `packages/timeline/tests/animation.easing.test.ts`.

**Change:**

- `easing.ts`: `parseEasing(id: string): EasingFn | null`. Accepts the seven
  named ids, `cubic-bezier(x1,y1,x2,y2)` (solve x by Newton with bisection
  fallback, 1e-4 tolerance, x1 and x2 clamped to [0,1]), and
  `spring(stiffness,damping,mass)` (closed-form damped oscillator normalized
  so f(0)=0, f(1) within 1e-3 of 1; overshoot allowed). `ease(id, t)` keeps
  its signature and delegates. Parsing is memoized per string.
- Keyframe-level `easing` on custom curves and preset segments accept the
  grammar. `normalizeCustomCurves` validates easing strings and reports
  the offending one.
- Validator code `unknown_easing` (warning) for a string that does not
  parse; the sampler falls back to linear (I2).
- Preset catalog: `pop`'s default easing becomes `spring(180,12,1)` only if
  the existing `animation.wipe`/`pop` tests still pass at their sampled
  points; otherwise leave the catalog alone and note it.

**Tests:** analytic anchors: `cubic-bezier(0,0,1,1)` equals linear at ten
points; `cubic-bezier(0.42,0,0.58,1)` matches `easeInOut` within 1e-3;
`spring` with critical damping never overshoots; malformed strings return
null. Fixture triggering `unknown_easing`.

### T7 — Channels and fold metadata · **Opus**

**Resolves:** F1 (channel half). Serial chain start (R4).

**Read first:** `animation/sample.ts` (the fold), `animation/compile.ts`,
`render/sceneModel.ts` (`resolveAnimatedLayerProps`,
`composeAnimatedEffects`), `render/transform.ts` (`buildTransformMatrix`),
`render/canvas2d.ts`, `render/frameCompositor.ts`, `render/effects.ts`.

**Change:**

- `sample.ts`: fold by `ANIMATED_PROPERTY_FOLD` instead of the property
  switch. `replace` channels take the last enabled animation in document
  order; record `replacedBy` so the validator can warn on overlap.
- `resolveAnimatedLayerProps`: `scaleX/scaleY` multiply the respective axis
  (existing `scale` multiplies both); `positionX/Y` replace
  `transform.position`; `anchorX/Y` replace `transform.anchor`;
  `contrast/hue/temperature/tint` fold into the synthesized color effect
  with identities matching `ClipColorEffect` defaults; `trimStart/trimEnd`
  land on `shapeStyle` for the shape rasterizer (T16 draws them; until then
  they are carried and ignored).
- Presets: keep the existing catalog unchanged. Add two presets that
  exercise the new channels: `squash`
  (emphasis, scaleX up while scaleY down and back, `easeOutBack`) and
  `hueShift` (loop, hue 0→360). Document them in the catalog.
- `transform.ts`: `buildTransformMatrix` accepts non-uniform scale.

**Tests:** `animation.sample.test.ts` fold cases per kind; a
`replace` overlap case; `render.transform.test.ts` non-uniform scale;
canvas2d pixel test that `scaleX: 2` doubles a shape's width and not its
height; preview parity test in `packages/agents/tests/capabilities-timeline-preview.test.ts`.

### T8 — Character and line stagger · **Sonnet**

**Resolves:** F4 (stagger half).

**Read first:** `docs/plans/motion-typography.md`, `animation/compile.ts`
(stagger span), `render/sceneModel.ts` (`resolveTextStaggerContext`,
`clipStaggerCount`), `render/draw.ts` (`drawStaggeredText`),
`packages/timeline/tests/animation.stagger.test.ts`.

**Change:** `unit: "character"` counts grapheme clusters
(`Intl.Segmenter` with a code-point fallback) per wrapped line and draws
per glyph with `measureText` advances; `unit: "line"` counts wrapped lines.
The span-compression rule stays and now reports `compressed: true` from the
compiler so T30 can warn. Whitespace characters are counted for timing and
drawn nothing.

**Tests:** a five-character word with `offsetMs: 100` produces five windows
100 ms apart; a two-line clip with `unit: "line"` produces two; an emoji
grapheme counts once. Rasterizer snapshot at mid-stagger through canvas2d.

---

## Milestone 2 — Structure

### T9 — Groups with transform inheritance · **Opus**

**Resolves:** F5 (parenting half). Decision D4. Serial chain.

**Read first:** `render/sceneModel.ts` end to end, `render/transform.ts`,
both compositors, `packages/timeline/src/splitClip.ts`, `trimClip.ts`,
`linked.ts` (how linked clips move together), the web store
`web/src/stores/timeline/TimelineStore.ts` (`patchClip`, move/trim actions).

**Change:**

- Scene model: resolve group clips first into `resolvedGroups: Map<clipId,
  {matrix, opacity, window}>` (a group may itself have a parent; resolve
  depth-first, refuse cycles). A child layer outside its parent's window is
  not emitted. `ActiveLayer` gains `parentMatrix?: Mat4` and the emitted
  opacity already includes the parent's.
- `buildTransformMatrix(layer, canvas, parentMatrix?)` composes
  `parent × own`. Both compositors pass it through; no other change to them.
- Pure ops in `packages/timeline/src`: `moveClip` of a group moves its
  children by the same delta; `deleteClip` of a group unparents children
  (does not delete them); `splitClip` refuses a group (message: split the
  children); `trimClip` on a group clamps children to the new window.
- Web store: route move/delete/trim of a group through those ops. Groups
  render on the track lane as a bracket over their children's span; no
  inspector work beyond a read-only "Parent" row.
- Validator codes `parent_missing`, `parent_cycle`, `parent_not_group`.

**Tests:** scene-model tests for composition order (`parent × child`
position, rotation about the parent's anchor), window clipping, nested
groups, cycle refusal; op tests for move/delete/trim; canvas2d pixel test
that rotating a group rotates a child about the group's anchor.

### T10 — Precomposite: group effects and blend · **Opus**

**Resolves:** F5 (precomp half). Serial chain.

**Read first:** T9's scene model, `render/frameCompositor.ts`
(`HeadlessFrameCompositor`), `packages/gpu/src/compositor/compositor.ts`
(`WebGPULayerCompositor`), `render/canvas2d.ts`.

**Change:** a group with `effects` or a `blendMode` other than `normal`
composites its children into an intermediate frame-sized texture (GPU: a
second `WebGPULayerCompositor` pass into an offscreen texture; 2D: an
`OffscreenCanvas` or `@napi-rs/canvas` canvas through `RasterContext2D`'s
factory hook, added to the interface), runs the group's effect chain on it,
then blends the result once at the group's z. Children of such a group are
removed from the main stack. Without those fields nothing changes (T9
path).

**Tests:** a group with `opacity: 0.5` over two overlapping children reads
as one 50% layer (no double darkening in the overlap) on both compositors;
a group `blur` blurs the composite, not each child; unsupported group
effects on 2D are reported through `unsupportedEffectTypes` (I7).

### T11 — Two-clip transitions · **Opus**

**Resolves:** F6. Decision D5. Serial chain.

**Read first:** `render/sceneModel.ts` (`crossfadeOpacity`, the auto-dissolve
rule), the `motion-graphics` skill's transition section, both compositors'
wipe handling, `animation/sample.ts` (`AnimationSampleMask`).

**Change:**

- `resolveTransition(clip, prevOnTrack, timeMs)` returns `{type, progress
  (eased), role}` for the incoming clip and, when a partner exists, the
  complementary record for the outgoing clip. `ActiveLayer.transition`
  carries it. `crossfadeOpacity` is folded into it; the auto-crossfade on
  overlap stays the default.
- Draw rules per type, identical on both compositors: `dipToColor` draws a
  full-frame solid whose opacity peaks at progress 0.5 while both clips
  fade; `wipe` masks the incoming layer with the existing feathered wipe and
  leaves the outgoing beneath; `push` offsets outgoing by `-progress ×
  frame` and incoming by `(1-progress) × frame` along `direction`; `slide`
  moves only the incoming; `zoom` scales outgoing up and incoming from
  0.8 with a crossfade.
- Bridge op `set_transition` (`{target, transition | null}`); the browser
  `ui_timeline_set_clip_params` refusal of `transitionIn` stays, the new op
  replaces it. `transition_exceeds_duration` covers the new types.
  Validator `unknown_transition` (I2).

**Tests:** per-type scene-model tests for both roles at progress 0, 0.5, 1;
canvas2d pixel tests for `push` (a red-over-blue frame is half red, half
blue at 0.5) and `dipToColor` (mid-frame is the color); preview parity.

### T12 — Masks and track mattes · **Opus**

**Resolves:** F7. Decision D6. Serial chain.

**Read first:** `packages/gpu/src/shaders/mask/{apply,fromImage,invert}`,
`render/effects.ts` (how a shader step is invoked), `render/draw.ts`,
`render/canvas2d.ts` wipe mask path (`destination-in` gradient), T9/T10
offscreen hooks.

**Change:**

- `draw.ts`: `drawMask(ctx, mask, w, h)` rasterizes `rect | ellipse | path`
  in normalized layer space with `featherPx` (2D: blur through a gradient
  ring for rect/ellipse, `ctx.filter` blur for path where available) and
  `invert`. Path data parsed by a small SVG path parser in
  `packages/timeline/src/render/svgPath.ts` (M, L, C, Q, Z, absolute and
  relative; anything else is `mask_path_invalid`).
- GPU: the mask raster is uploaded as a texture and applied with
  `maskApplyV1` before the layer blend. 2D: `ctx.clip` for hard masks,
  offscreen `destination-in` for feathered.
- Mattes: a layer with `matte` receives `matteLayer` from the scene model
  (source removed from the stack); the compositor renders the source to an
  offscreen texture and applies it as alpha or luma via `maskFromImageV1`
  (2D: `destination-in`, luma converted through a grayscale pass).
- Bridge ops `set_mask`, `set_matte`. Validator `matte_source_missing`,
  `mask_path_invalid`.

**Tests:** ellipse mask on a solid reads transparent at the corners and
opaque at center on both compositors; inverted path mask the reverse; a
luma matte from a linear-gradient shape produces a ramp; a matte source
never draws itself.

### T13 — Clip effects from the shader catalog · **Sonnet**

**Resolves:** F12 (reach half). Decision D7. Serial chain end.

**Read first:** `render/effects.ts`, `packages/gpu/src/shaders/index.ts`
(exports for `glow`, `dropShadow`, `vignette`, `sharpen`, `chromaKey`,
`curves`, `levels`, `liftGammaGain`), `packages/image-nodes/src/nodes/lib-image-effects.ts`
(parameter mapping already done once for images),
`render/canvas2d.ts` (`unsupportedEffectTypes`, filter mapping).

**Change:** map each new `ClipEffect` type to its shader step with the same
parameter conventions the image nodes use. 2D implements `dropShadow`
through `shadowColor/shadowBlur/shadowOffsetX/Y` on the layer draw and
lists every other new type in `unsupportedEffectTypes`. Bridge op
`set_effects` (`{target, effects[]}`) replaces the list. Validator
`unknown_effect` (I2). Track effects are untouched.

**Tests:** per-effect GPU test under lavapipe asserting a pixel property
(glow spreads beyond the source rect; levels with `inBlack: 0.5` clips a
mid-gray to black; chroma key removes the keyed color); 2D reports the
unsupported set exactly; the headless preview returns them in
`effects_not_applied`.

---

## Milestone 3 — Text, shape, fonts

### T14 — Text style: stroke, shadow, background, spacing · **Sonnet**

**Resolves:** F4 (styling half), part of F15's fallback.

**Read first:** `render/draw.ts` (`drawText`, `drawStaggeredText`, the
line-height and vertical-center constants), `web/src/components/timeline/preview/textRender.ts`
(cache key), `packages/agents/src/timeline-preview/rasterize.ts`.

**Change:** honor `fontStyle`, `letterSpacingPx` (manual advance per
glyph; `ctx.letterSpacing` where the context supports it), `lineHeight`,
`verticalAlign`, `stroke` (drawn before fill), `shadow`, `background`
(rounded rect behind the wrapped block with padding), `fill` gradient
(T16's `ShapeFill` helper). Extend the raster cache key with every new
field. Stagger draws per unit with the same style.

**Tests:** pixel tests through canvas2d for stroke width, shadow offset,
background bounds, `verticalAlign: "top"`; the cache-key test enumerates
the style fields via `Object.keys` of a fully populated style so a new
field cannot be forgotten.

### T15 — Caption style · **Sonnet**

**Resolves:** hard-coded caption look (F4 family).

**Read first:** `render/draw.ts` (`drawCaption`, the `#FFD60A` and 5%
constants), `web/src/components/timeline/preview/captionRender.ts`,
`packages/timeline/src/subtitles.ts`.

**Change:** `drawCaption` reads `caption.style` with today's values as
defaults. `ui_timeline_set_clip_params` and the `set_clip_params` op accept
`captionStyle`. The inspector's caption section exposes the fields with
primitives. SRT/VTT export is unchanged.

**Tests:** default render is pixel-identical to before (snapshot); a
custom `activeColor` changes only the active word.

### T16 — Shapes: paths, polygons, gradients, dashes, trim · **Opus**

**Resolves:** F8.

**Read first:** `render/draw.ts` (`drawShape`, the `RasterContext2D`
interface at the top), T12's `svgPath.ts`,
`web/src/components/timeline/preview/shapeRender.ts`.

**Change:**

- `RasterContext2D` gains `bezierCurveTo`, `quadraticCurveTo`, `arc`,
  `setLineDash`, `lineCap`, `createLinearGradient`, `createRadialGradient`
  (both `OffscreenCanvasRenderingContext2D` and `@napi-rs/canvas` satisfy
  them, I6).
- `drawShape` handles `path` (through `svgPath.ts`), `polygon`, `star`,
  `cornerRadius`, `fillStyle` gradients, `dash`, `lineCap/Join`,
  `trimStart/trimEnd` (walk the flattened path by arc length and stroke
  the sub-range).
- `ShapeFill` helper shared with T14 text fills.

**Tests:** pixel tests for a star's point count (sample along a circle), a
`trimEnd: 0.5` path stroking half its length, a dashed line's gap, a
linear gradient's two ends; `svgPath.ts` unit tests for relative commands
and `Z`.

### T17 — Font pipeline · **Opus**

**Resolves:** F15. Decision D8. Independent of the chain.

**Read first:** `packages/websocket/src/trpc/routers/fonts.ts`,
`packages/config/src/package-asset-registry.ts` (`PACKAGE_RUNTIME_ASSETS`,
`loadPackageAssetJson`), `scripts/bundle-backend.mjs` and
`scripts/verify-backend-bundle.mjs` (asset staging), `render/draw.ts`
font string, `packages/agents/src/timeline-preview/rasterize.ts`,
`packages/video-nodes/src/nodes/timeline/rasterizers.ts`,
`web/src/components/timeline/preview/textRender.ts`, `Dockerfile` font
packages.

**Change:**

- `packages/timeline/fonts/`: Inter (variable), Space Grotesk, Playfair
  Display, JetBrains Mono, Bebas Neue, Lora, with their OFL files (C7).
  `packages/timeline/src/fonts/catalog.ts` lists family, weights, style,
  relative path, license. Register the directory in
  `PACKAGE_RUNTIME_ASSETS` so the bundle stages it and the verifier checks
  it (C6).
- `resolveFontFamily(name) → { family, portable }`. `draw.ts` builds its
  font string from it; the fallback stack ends in `sans-serif`.
- Registration: `registerBundledFonts()` in
  `packages/timeline/src/fonts/register-node.ts` calls `GlobalFonts.registerFromPath`
  once per process; the agent preview and the server rasterizer call it
  before drawing. Web: a generated `@font-face` stylesheet under
  `web/src/components/timeline/fonts.css` pointing at the same files served
  from `/api/assets/packages/timeline/fonts/<file>`, loaded by the timeline
  editor and awaited (`document.fonts.load`) before a text raster.
- Fonts endpoint returns `{name, source: "bundled" | "system", portable}`.
  Inspector font picker lists bundled first with a "portable" mark.
- Validator `font_not_portable` (warning) when a text clip names a family
  not in the catalog.

**Tests:** the server rasterizer and the agent preview draw the same word in
Bebas Neue and the bitmaps match within a tolerance (same library, same
face); a system-only family is flagged; `verify-backend-bundle` fails when
a font file is removed from the staged bundle (prove it, restore).

---

## Milestone 4 — Agent surface

### T18 — `set_timeline_document` · **Opus**

**Resolves:** F18.

**Read first:** `packages/agents/src/capabilities/timelines.ts` (CAS retry
pattern in `edit_timeline`, snapshot helpers),
`packages/websocket/src/trpc/routers/timeline.ts` (`update`,
`baseUpdatedAt`), `packages/execution/src/timeline-debug/validate.ts`.

**Change:** capability `set_timeline_document {timeline_id, document, fps?,
width?, height?, expected_updated_at?, snapshot_name?}`: validate first
(errors refuse the write and return the issues), snapshot as a manual
version, CAS write, return the post-write validation. Add
`timelines.setDocument` to the CodeAct object model and a capability-table
row.

**Tests:** `capabilities-timelines.test.ts`: happy path, validation refusal,
CAS conflict, snapshot exists after write.

### T19 — Structural ops in the bridge · **Sonnet**

**Resolves:** wiring for T9, T11, T12, T13, T29 into `edit_timeline` and
`ui_timeline_*`.

**Read first:** `packages/agents/src/evals/surfaces/timeline.ts` (bridge
tool table), `packages/agents/src/capabilities/timelines.ts` (op
normalization, `MAX_OPS`), `web/src/lib/tools/builtin/timeline.ts`,
`packages/agents/src/capabilities/timelines.specs.ts`.

**Change:** ops `add_group {name, startMs, durationMs, trackId?}`,
`set_parent {target, parentId | null}`, `set_transition`, `set_mask`,
`set_matte`, `set_effects`, `set_time_remap`, each with a Zod input in the
op schema and a browser twin. Each op's error message on a bad target lists
valid ids. Skip any whose feature task has not merged; list them in the PR.

**Tests:** `timelines-op-input.test.ts` per op; the bridge continues past a
failing op and records it.

### T20 — Markers and beat snapping · **Opus**

**Resolves:** F23.

**Read first:** `packages/agents/src/capabilities/analysis.specs.ts`
(`detect_audio_events` output shape), `mobile/src/documents/tools/timelineTools.ts`
(`ui_timeline_add_marker`), `packages/timeline/src/snap.ts` and
`resolveSnap.ts`, `buildSnapPoints.ts`.

**Change:**

- Ops `add_marker {timeMs, label, color?}`, `delete_marker {id}`,
  `set_markers_from_beats {onsets_ms[] | (bpm, offset_ms, count), label?}`.
- Op `snap_to_beats {targets[] | "all", grid: onsets_ms[] | (bpm,
  offset_ms), tolerance_ms (default 60), mode: "start" | "end" | "both",
  action: "move" | "trim"}`: for each target, find the nearest grid time
  within tolerance to the chosen boundary and move or trim to it; report
  per clip `{clipId, before, after, delta}` and skip out-of-tolerance
  clips with a reason. Pure function `snapClipsToGrid` in
  `packages/timeline/src/beats.ts`, used by the op.
- Browser twins for the marker ops.

**Tests:** `beats.test.ts` analytic cases (a 120 BPM grid, clips 30 ms off
snap, 90 ms off do not; `trim` keeps `startMs`); op tests.

### T21 — Compositions · **Opus**

**Resolves:** F20. Decisions D11, AS6.

**Read first:** `packages/agents/src/capabilities/entities.ts` (asset
marker pattern, `ENTITY_METADATA_KEY`), T9 groups,
`packages/base-nodes/nodetool/examples/storyboards/` and
`scripts/build-example-storyboards.mjs` (shipped example pattern),
`packages/system-skills/caption-titles/SKILL.md` (the five tiers to encode).

**Change:**

- `packages/timeline/src/composition.ts`: `TimelineComposition {id, name,
  description, params: Record<name, {type: "string" | "number" | "color" |
  "boolean", default, path: string}>, group: TimelineClip, children:
  TimelineClip[]}` where child times are relative to the group start and
  `path` is a JSON pointer into a child (`/1/textStyle/text`).
  `instantiateComposition(comp, {startMs, trackId, params}) → clips[]`
  with fresh ids, `compositionId` and `compositionParams` stamped.
  `extractComposition(doc, groupId, params) → TimelineComposition`.
- Capabilities `list_compositions`, `get_composition`, `save_composition
  {timeline_id, group_target, name, params}` (writes a JSON asset with
  `metadata.nodetool_composition`), `delete_composition`; op
  `insert_composition {composition_id, startMs, trackId?, params}`.
- Shipped compositions in
  `packages/base-nodes/nodetool/examples/compositions/`: `title-card`,
  `lower-third`, `caption-bar`, `callout`, `cta-end-card`, `logo-sting`,
  built by `scripts/build-example-compositions.mjs` from a spec, validated
  with `validate_timeline` on a scratch document, registered in
  `PACKAGE_RUNTIME_ASSETS`, listed by `list_compositions` as `source:
  "shipped"`.

**Tests:** instantiate then extract is identity modulo ids; a param path
that misses is refused; inserting `lower-third` into the JTBD fixture
validates and previews with the name visible (pixel test on the text
bounds).

### T22 — `render_timeline` as a job · **Opus**

**Resolves:** F21, F14 (job half). Decision D12.

**Read first:** `packages/execution/src/service/workflow-run.ts`
(`runWorkflow`), `packages/agents/src/capabilities/jobs.specs.ts`
(`get_job`, `get_job_logs`), how `start_background_job` builds and submits
a graph, T3's node props.

**Change:** capability `render_timeline {timeline_id, format?, alpha?,
video_codec?, bitrate?, motion_blur_samples?, shutter_angle?,
preview_scale?, wait?: boolean, timeout_ms?}` builds a one-node graph and
submits it as a job; returns `{job_id}` or, with `wait`, `{job_id, asset_id,
render_mode, duration_ms}`. `preview_scale` renders at a fraction of the
sequence size for drafts (R1). Add `timelines.render` to the object model,
a capability-table row, and a line in the chat prompt's timeline section
(`packages/websocket/src/session/chat-prompt.ts`) telling the agent to
render and look before declaring a cut done.

**Tests:** capability test with the execution service in-process on a
two-clip fixture under lavapipe; `render_mode === "composited"`;
`understand_video`-free assertion by decoding the middle frame with
Mediabunny and reading a pixel.

### T23 — Preview range, contact sheet, and diff · **Sonnet**

**Resolves:** F22.

**Read first:** `packages/agents/src/timeline-preview/frames.ts`,
`timelines.specs.ts` (`PREVIEW_TIMELINE_FRAME_SCHEMA`, the caps),
`packages/agents/src/sandbox-media.ts` or the `image.grid` helper the
sandbox exposes.

**Change:** `preview_timeline_frame` gains `range {from_ms, to_ms, count ≤
24}` (evenly spaced, inclusive) and `sheet: boolean` (tile every frame
into one image with a timecode label per cell, columns = ceil(sqrt(n)));
with `sheet` the response carries one handle plus the per-frame layer
reports. New capability `compare_timeline_frames {a: timeline_id |
document, b: timeline_id | document | {version}, times_ms[] | range}`
returning per-frame mean absolute pixel difference (0..1) and a
side-by-side sheet handle. Caps: 24 frames, 1280 px width.

**Tests:** sheet dimensions and cell count; a diff of a document against
itself is 0; against a shifted clip is > 0 only at the affected times.

### T24 — Skill and prompt updates · **Opus**

**Resolves:** the teaching half of F19–F23.

**Read first:** `packages/system-skills/motion-graphics/SKILL.md`,
`packages/system-skills/caption-titles/SKILL.md`,
`packages/websocket/src/session/chat-prompt.ts` (timeline lines),
`docs/WRITING_STYLE.md`, every tool spec landed in T4, T18–T23.

**Change:** `motion-graphics` gains sections: keyframes and the easing
grammar (when a preset is enough, when to write curves, the fold rules for
replace channels); groups (rig a lower third as a group, animate the
group); transitions (which type for which cut, the auto-crossfade rule);
masks and mattes; compositions (insert first, override params, extract a
new one when the user approves a look); beat cutting (`detect_audio_events`
→ `snap_to_beats`, tolerance guidance); the render loop (`preview` while
iterating, `render_timeline` with `preview_scale` before the final,
`compare_timeline_frames` after a change the user did not ask for); the
validator codes and what each means. Keep the existing timing and easing
guidance. `caption-titles` maps each tier to a shipped composition.
Chat prompt: two lines, render-before-done and snapshot-before-edit.

**Tests:** `packages/system-skills` has a lint test for skill frontmatter;
run it. Read the skill aloud against the tool specs: every tool and op it
names exists (write a test that greps the skill for `` `[a-z_]+` `` names
and checks them against the capability registry and op list).

### T25 — Motion evals and a JTBD job · **Opus**

**Resolves:** F25.

**Read first:** `packages/agents/src/evals/surfaces/timeline.ts` (cases,
`TIMELINE_SYSTEM_PROMPT`), `packages/agents/src/evals/tool-loop-eval.ts`,
`packages/agents/src/jtbd/registry.ts` (`caption-titles-picture-locked`),
`packages/agents/tests/jtbd-friction.test.ts` (the untouched-world rule),
`packages/cli/src/harness/capability-table.ts`.

**Change:**

- The eval system prompt embeds the `motion-graphics` skill body.
- New `timeline-tools` cases with deterministic predicates:
  `kinetic-title-staggered` (stagger span fits the clip: `durationMs +
  offsetMs × (units−1) ≤ clip.durationMs`), `lower-third-layered` (a shape
  clip on a higher-index track than the text, both within the picture
  clip's window), `entrance-decelerates` (every `in` animation's easing is
  an ease-out family or a spring), `beat-cut` (given onsets in the
  objective, every picture boundary within 60 ms of one),
  `looked-before-done` (`preview_timeline_frame` called after the last
  edit), `keyframed-slide` (from T4).
- JTBD job `motion-title-sequence`: a vertical timeline with music and three
  shots; objective in the user's words (a title sequence that lands on the
  beat with a lower third and an end card); outcomes: markers or clip
  boundaries on the grid, a group or composition used, every text clip
  animated in and out with a fitting stagger, a preview call in the
  transcript. Must fail on the untouched world.
- Capability-table rows for the new capabilities name these cases;
  `npm run capabilities:sync`.

**Tests:** each predicate has a passing and a failing hand-built final
state in `timeline-tool-loop.test.ts`.

### T26 — Browser batch tool and mobile parity · **Sonnet**

**Resolves:** F26.

**Read first:** `web/src/lib/tools/builtin/timeline.ts`,
`web/src/components/timeline/timelineAgentBridge.ts`,
`mobile/src/documents/tools/timelineTools.ts`, `mobile/AGENTS.md`.

**Change:** `ui_timeline_edit {timeline_id, ops[]}` in web and mobile,
dispatching to the same handler methods the single tools use, continuing
past failures with a per-op record (mirror `edit_timeline`). Mobile gains
`ui_timeline_animate_clip`, `ui_timeline_clear_animations`,
`ui_timeline_list_animation_presets`, `ui_timeline_add_media_clip`,
`ui_timeline_set_clip_binding`, and the T19/T20 ops that exist on web.

**Tests:** web tool tests for the batch path; mobile jest for the new
tools' schemas; `npm --prefix mobile run typecheck`.

---

## Milestone 5 — Render quality

### T27 — Alpha export and output formats · **Opus**

**Resolves:** F13. Depends on T3.

**Read first:** `packages/video-nodes/src/nodes/timeline/rawFrames.ts`
(`openFrameEncoder`), `compositeRender.ts`, `render/frameCompositor.ts` and
`render/canvas2d.ts` seed color, `web/src/components/timeline/render/TimelineRenderer.ts`
(mediabunny output options), `web/src/hooks/timeline/useTimelineExport.ts`.

**Change:** `alpha: true` seeds both compositors transparent and keeps
straight alpha through to the encoder. Server: `webm` → `libvpx-vp9
-pix_fmt yuva420p`; `mov` → `prores_ks -profile:v 4444 -pix_fmt yuva444p10le`;
`png_sequence` → PNGs zipped as one asset with a `manifest.json` (fps,
count, size). `mp4` with `alpha` is refused with the list of formats that
carry alpha. Browser export gains a format and alpha choice in the export
dialog (WebM VP9 alpha through mediabunny, PNG sequence as a zip). Node
props and the `render_timeline` inputs from T22 pass through.

**Tests:** a transparent frame region decodes with alpha 0 (Mediabunny on
the WebM; PNG read on the sequence); `mp4 + alpha` refused; ProRes path
skipped with a message when ffmpeg lacks `prores_ks`.

### T28 — Motion blur · **Opus**

**Resolves:** F11. Decision D10. Serial chain end.

**Read first:** both compositors' frame entry points, T3/T22 options,
`TimelineRenderer.ts` stepping loop.

**Change:** `renderFrame(timeMs, {samplesPerFrame = 1, shutterAngle = 180})`
composites N samples at `timeMs + (i + 0.5)/N × shutterAngle/360 × frameMs`
and averages them (GPU: accumulate into an `rgba16float` texture and
resolve; 2D: draw each sample with `globalAlpha = 1/N` onto a cleared
canvas). Applies to browser export, server render and the frame preview
(`preview_timeline_frame` gains `motion_blur_samples` for checking a
setting). Default off.

**Tests:** a fast-moving shape with 8 samples produces a smear whose width
matches the analytic travel over the shutter window within one pixel; with
1 sample the output is unchanged (snapshot).

### T29 — Time remap · **Opus**

**Resolves:** F9. Decision D13.

**Read first:** `packages/timeline/AGENTS.md` (source-time rules),
`packages/timeline/src/sourceRate.ts`, `splitClip.ts`, `trimClip.ts`,
`render/sceneModel.ts` (`clipSourceTimeSec`), the preview's video pool
(`web/src/components/timeline/preview/PreviewCompositor.tsx`) and the
server decoder's forward-only constraint (`rawFrames.ts`).

**Change:** `clipSourceTimeSec` evaluates `timeRemap.keyframes` (piecewise,
eased) when present, else today's rate. `splitClip` and `trimClip` refuse a
remapped clip with a message naming `bake_time_remap`; a new pure
`bakeTimeRemap` is out of scope (say so) and the refusal is the contract
(D13). The server decoder handles a backwards source seek by reopening the
stream (slow, correct); the browser pool seeks. Validator
`time_remap_not_monotonic` (t must ascend; sourceMs may descend).

**Tests:** a two-keyframe ramp 0→2× reaches the analytic source time at
0.25/0.5/0.75; a reverse curve decodes descending frames on the server
path; split refused.

### T30 — Validator codes · **Sonnet**

**Resolves:** F24 and the codes named across M1–M5.

**Read first:** `packages/execution/src/timeline-debug/validate.ts`,
`report.ts`, `markdown.ts`, the `motion-graphics` skill's list of failures
it owns, T6–T29 PR bodies for codes they added.

**Change:** implement or reconcile: `animation_exceeds_clip` (window longer
than clip after delay), `stagger_compressed` (compiler flag from T8),
`text_illegible` (font size below 2.5% of frame height; contrast under 3:1
against `background.color` when set, else against a declared shape clip
fully behind it on a higher-index track), `replace_curves_overlap`,
`unknown_easing`, `unknown_transition`, `unknown_effect`, `parent_*`,
`matte_source_missing`, `mask_path_invalid`, `layer_cap_exceeded`,
`font_not_portable`, `time_remap_not_monotonic`. Severity: warnings
except `parent_cycle`, `matte_source_missing`, `time_remap_not_monotonic`
(errors). Update `docs/cli.md` § timeline validate and the skill's code
table.

**Tests:** one fixture per code that triggers it and one that does not;
`nodetool timeline validate --json` on the shipped example storyboards'
assembled timelines stays clean.

### T31 — Inspector UI for the new fields · **Sonnet**

**Resolves:** AS4's thin UI layer.

**Read first:** `web/src/components/timeline/Inspector/` (`ClipAnimations.tsx`,
`ClipAdjustments.tsx`, `InspectorPrimitives.helpers.ts`),
`web/src/components/ui_primitives/STRATEGY.md`, `docs/DESIGN.md`.

**Change:** sections for transition type and params, mask, matte source
picker, effects list (add/remove/reorder with per-type fields), text style
fields (T14), shape fields (T16), parent (read-only from T9 plus a
"group selected clips" action), curve list for custom animations (property,
keyframe table, easing string with the grammar hint), font picker (T17).
No graph editor. Every control writes through the store's `patchClip`.

**Tests:** RTL tests per section that a change reaches the store; a11y
labels on every control.

---

## Running the plan

Suggested wave order for a team of agents:

1. **Wave 1 (parallel):** T1, T3, T5, T17.
2. **Wave 2 (after T1):** T2, T4, T6, T14, T15, T18, T20, T23 in parallel;
   T7 starts the compositor chain.
3. **Wave 3:** T8, T9 (chain), T16, T22 (after T3), T26.
4. **Wave 4:** T10 → T11 → T12 → T13 (chain, one at a time), T19 as each
   lands, T21 (after T9), T27 (after T3).
5. **Wave 5:** T28 → T29 (chain), T24, T25, T30, T31.

Each wave ends with `npm run dev:nodetool -- harness gate --base main` on
the merged tree and `nodetool eval timeline-tools -p claude_agent_sdk -m
claude-sonnet-5 --min-success 0.8` (keyless, see AGENTS.md § nodetool eval).

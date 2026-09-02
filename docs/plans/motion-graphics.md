# Motion Graphics — Technical Design

Status: implemented.
Companion doc: [motion-graphics-tasks.md](motion-graphics-tasks.md) (the
agent-consumable task list, sequencing, and acceptance criteria).
Predecessors: [motion-design.md](motion-design.md) (preset animation engine,
implemented), [motion-typography.md](motion-typography.md) (per-word stagger,
implemented), [../timeline-custom-animations.md](../timeline-custom-animations.md)
(JS baked to curves, implemented).

## Goal

Two outcomes, in this order:

1. **The timeline can render and direct motion graphics at a professional
   level.** Keyframes on any property with parametric easing, groups with
   transform inheritance, real two-clip transitions, masks and mattes, the
   shader library on clips, styled text with per-character motion, vector
   shapes with paths and gradients, reproducible fonts, and a server render
   that produces the picture the editor previews, with alpha, image-sequence
   and motion-blur options.
2. **An agent can direct that work efficiently.** Write a whole document in
   one call, author keyframes and curves without a UI, instantiate stored
   compositions (lower third, title card, logo sting, callout), cut to a beat
   grid, render the finished cut headlessly and look at it, and be measured
   on motion quality rather than on tool-call shape.

## Findings this plan resolves

Codes are stable across this document, the task list, and PR descriptions.
Every finding below was verified against the tree; file references are the
evidence.

**Animation model**

- **F1** No first-class keyframes. A clip carries `animations: ClipAnimation[]`
  naming a preset; nine animatable channels (`ANIMATED_PROPERTIES`,
  `packages/timeline/src/animation/types.ts`). Position animates only as an
  additive offset; scale only uniformly. Anchor, non-uniform scale, contrast,
  hue, temperature, tint, text and shape attributes, border radius and volume
  are static.
- **F2** Seven fixed easings (`animation/easing.ts`), no cubic bezier, no
  spring, no tunable overshoot.
- **F3** No expressions and no parenting. Custom animations bake once
  (`animation/custom.ts`). This is by design and stays.
- **F4** Stagger is word-only (`compile.ts`, `unit: "character"` declared,
  unimplemented). No range selectors, no per-glyph geometry, no text on path.

**Structure and compositing**

- **F5** No groups, parents, precomps, nulls or adjustment layers. No
  `parentId` anywhere in `packages/timeline/src/types.ts` or
  `packages/protocol/src/api-schemas/timeline.ts`.
- **F6** One transition type, `crossfade`, linear, incoming clip only
  (`types.ts` `ClipTransition`, `sceneModel.ts` `crossfadeOpacity`).
- **F7** The only mask is the wipe animation's four-direction feathered edge
  (`animation/sample.ts` `AnimationSampleMask`). No shape masks, no track
  mattes. `packages/gpu/src/shaders/mask/*` exist and are unused by the
  timeline.
- **F8** Shapes are `rect | ellipse | line`, rasterized, no paths, gradients,
  dashes, trim, or SVG import (`types.ts` `ClipShapeStyle`, `draw.ts`
  `drawShape`).
- **F9** Time is one scalar `speedMultiplier`, clamped positive
  (`sourceRate.ts`). No ramps, remap, reverse, or frame blending.

**Renderer**

- **F10** The production server render is the rough cut. `bundle-backend.mjs`
  stages `webgpu` (Dawn) on the desktop profile only
  (`DESKTOP_ONLY_EXTERNAL_PACKAGES`), while the Dockerfile already installs
  `mesa-vulkan-drivers` (lavapipe) for the image nodes. `RenderTimeline`
  therefore hits `CompositorUnavailableError` and concatenates clips,
  dropping transforms, effects, text, shapes and overlays
  (`packages/video-nodes/src/nodes/timeline.ts`).
- **F11** No motion blur. Export samples one instant per frame
  (`web/src/components/timeline/render/TimelineRenderer.ts`); one bilinear
  tap per layer, no supersampling.
- **F12** sRGB 8-bit throughout (`frameCompositor.ts`, `effects.ts`
  `rgba8unorm`), `yuv420p` hardcoded on the server (`rawFrames.ts`). The
  timeline uses five of the shader modules in `packages/gpu/src/shaders/`;
  glow, drop shadow, curves, levels, lift/gamma/gain, film look, corner pin,
  displace and LUT-style grades are unreachable from a clip.
- **F13** No alpha export and no image-sequence export. Both compositors seed
  with opaque black (`canvas2d.ts` `drawTimelineFrame`, `frameCompositor.ts`).
- **F14** No render job. `renderTimelineComposited` accepts `onProgress` and
  `RenderTimelineNode` never passes it. No cancel token reaches the frame
  loop, no checkpoint, no frame cache. Browser export dies with the tab.
- **F15** No font pipeline. `packages/websocket/src/trpc/routers/fonts.ts`
  lists system font names; nothing bundles, downloads or registers a face.
  `draw.ts` falls back to `Inter, Arial, sans-serif`, which resolves
  differently on every host.

**Correctness**

- **F16** `CaptionWord.kind` and `confidence` exist in
  `packages/timeline/src/types.ts` and not in the Zod `captionWord`
  (`api-schemas/timeline.ts`), so every save strips them; filler-word removal
  reads `kind`.
- **F17** `MAX_VIDEO_LAYERS = 8` drops layers silently (`sceneModel.ts`).

**Agent surface**

- **F18** No declarative write. `validate_timeline` and
  `preview_timeline_frame` accept an inline `document`; nothing writes one
  back.
- **F19** Custom animations are built end to end (`bakeCustomAnimation`,
  `POST /api/timelines/animations/bake`) and no capability exposes them; the
  bridge throws `Unknown animation preset "custom"`
  (`packages/agents/src/evals/surfaces/timeline.ts`).
- **F20** No stored compositions. `packages/system-skills/caption-titles`
  describes five text tiers in prose; nothing instantiates one.
- **F21** No headless render of the finished cut for an agent to judge.
- **F22** Feedback is at most eight stills per call, no contact sheet, no
  range, no diff. `preview_timeline_frame` is missing from the CodeAct
  `nodetool.timelines` namespace (`packages/agents/src/codeact/nodetool-api.ts`).
- **F23** `detect_audio_events` returns onsets and tempo; no op snaps clips to
  them and there is no headless marker op.
- **F24** `validate_timeline` omits animation-longer-than-clip, compressed
  stagger, and legibility; the skill hands them to the agent.
- **F25** Nothing measures motion quality. `timeline-tools` cases check tool
  shape; the eval prompt carries none of the motion skill; no JTBD job loads
  `motion-graphics`; `preview_timeline_frame` has no eval case.
- **F26** The browser `ui_timeline_*` tools have no batch form; the mobile
  tool set (`mobile/src/documents/tools/timelineTools.ts`) has no
  `animate_clip`, `clear_animations`, `list_animation_presets`,
  `add_media_clip` or `set_clip_binding`.

## Assumptions

- **AS1** The one-model architecture stays: `packages/timeline/src/render/`
  is the single scene model, and the live preview, browser export, server
  render and agent frame preview all consume it. No feature lands in one host
  only.
- **AS2** `packages/timeline` stays pure TypeScript with no runtime
  dependencies at the package root (mobile compiles it from source). Render
  code lives under `src/render`, reached through `./render` (GPU) or
  `./scene` (no GPU), never the root export.
- **AS3** Dawn plus lavapipe is an acceptable production render device.
  Lavapipe is a CPU rasterizer; a 1080p30 minute at the current per-frame
  effect load is minutes, not seconds. Throughput is a later concern; parity
  is the goal of this plan.
- **AS4** The agent is the primary author. Every feature is specified as data
  plus a headless op first; the inspector UI is a thin layer added after, and
  a task that cannot fit the UI in scope says so rather than shrinking the
  data model.
- **AS5** Motion written as JavaScript continues to bake once at author time.
  There is no render-time expression engine and there will not be one.
- **AS6** A composition is a document fragment, not a new renderer. Templates
  are groups with parameters, stored as JSON assets, instantiated by copying
  clips into the target document.
- **AS7** Storage of new document fields is JSON-blob only. No new columns are
  needed for anything in this plan except none; compositions use the asset
  table with a metadata marker, the way entities do.
- **AS8** Frame determinism is required across hosts at the scene level
  (same layers, same transforms, same sampled values) and not at the byte
  level (decoders and encoders differ).

## Invariants

These hold before and after every task. A task that must relax one says so in
its PR and updates this list.

- **I1 Schema mirror.** Every field on `TimelineClip`, `TimelineTrack`,
  `ClipAnimation` and their children exists in both
  `packages/timeline/src/types.ts` and the Zod schema in
  `packages/protocol/src/api-schemas/timeline.ts`. The Zod schema strips
  unknown fields on every save; a field missing there is data loss.
  `packages/execution/src/timeline-debug/validate.ts` (`field_stripped`)
  is the check, and every new field gets a round-trip test.
- **I2 Forward compatibility by string.** `preset`, `easing`, curve
  `property`, transition `type`, effect `type`, mask `kind` and stagger
  `unit` are typed as `string` in the document and narrowed at compile or
  validate time. A document from a newer build parses; the unknown item is
  skipped with a validator warning, never a thrown error.
- **I3 Pure sampler.** `sampleAnimations` is a pure function of compiled
  curves and time. Its fold is commutative across animations on one clip:
  offsets and rotation add, scale and opacity multiply, wipes take the
  minimum. New channels declare their fold in `ANIMATED_PROPERTIES`
  metadata.
- **I4 No JS at render time.** A custom animation's body runs at bake and
  nowhere else (`normalizeCustomCurves` is the single gate).
- **I5 Source-time through one helper.** Every conversion from timeline time
  to source time goes through `clipSourceTimeSec` and `sourceRate`. Split,
  trim, merge, the preview and the render never reimplement it.
- **I6 Draw code takes `RasterContext2D`.** `draw.ts` never types against
  `OffscreenCanvas` or `@napi-rs/canvas`; both must satisfy the interface.
- **I7 Canvas 2D reports what it drops.** `unsupportedEffectTypes` names every
  effect the 2D path cannot apply; the headless preview returns them as
  `effects_not_applied`. Silent divergence between hosts is a bug.
- **I8 No WebGPU globals at module scope.** Under Node they exist only after
  the Dawn device installs them.
- **I9 Layer order is track order.** `trackZ(index) = 1000 - index`; lowest
  index on top. Groups do not change this: a child's z is its own track's z.
- **I10 A capability has a spec, an implementation, a table row, and a
  check.** New capabilities go in `*.specs.ts`, the implementation module,
  `packages/cli/src/harness/capability-table.ts` (regenerated with
  `npm run capabilities:sync`), and either a suite or an eval case.
  `npm run capabilities:check` fails otherwise.
- **I11 Headless and browser tools share one implementation.** `edit_timeline`
  ops dispatch to the same bridge the `ui_timeline_*` tools and the eval
  drive (`packages/agents/src/evals/surfaces/timeline.ts`
  `createTimelineToolBridge`). A new op is added there once.
- **I12 A new check proves it can fail.** Every validator code, eval predicate
  and JTBD outcome ships with a fixture that fails it
  (`docs/HARNESS_FIRST.md` rule 7, AGENTS.md § Claims, Checks, and
  Measurements).

## Constraints

- **C1** Node 22.22.1, ESM everywhere, `@nodetool-ai/<package>` imports only.
- **C2** Web UI uses `web/src/components/ui_primitives/` and the design
  tokens in `docs/DESIGN.md`. No raw MUI.
- **C3** Every PR runs `npm run test:affected`, `npm run typecheck`,
  `npm run lint`, plus `npm run dev:nodetool -- harness gate --base main`.
- **C4** Mobile is not a root workspace; `npm --prefix mobile`.
- **C5** `packages/agents` imports `@nodetool-ai/timeline/scene`, never
  `/render`. TypeGPU must not enter the agents package.
- **C6** The server bundle is the deploy artifact. Anything the server loads
  at runtime is staged by `scripts/bundle-backend.mjs` and verified by
  `scripts/verify-backend-bundle.mjs`; an unstaged file is a production
  failure, not a dev failure.
- **C7** Fonts shipped in the repo are OFL or Apache licensed and their
  license files ship next to them.
- **C8** No count, date or status word in `AGENTS.md`. Plan docs may carry a
  status line.
- **C9** PRs stay reviewable: one task per PR, target under 400 changed lines
  of non-test code, schema landing excepted.
- **C10** Every outbound fetch of a caller-chosen URL (a Google Fonts URL) goes
  through `safeFetch` and is inventoried in
  `docs/url-egress-inventory.md`.

## Decisions

- **D1 Schema lands first, in one PR.** Every new optional field in this plan
  is added to `types.ts`, the Zod schema and the validator's round-trip
  fixture in a single task (T1) before any feature task starts. Feature
  tasks then touch behavior files only, which keeps eight parallel agents
  off the same two files.
- **D2 Keyframes are curves, and curves already exist.** A first-class
  keyframe animation is `preset: "custom"` with `custom.curves` set directly
  and no `code`. The compiler already accepts this shape. The agent op adds
  `curves` as an input alongside `code`; the UI gets a curve list, not a
  graph editor, in this plan.
- **D3 Parametric easing by string grammar.** `easing` stays a string.
  `"cubic-bezier(x1,y1,x2,y2)"` and `"spring(stiffness,damping,mass)"` are
  parsed by `parseEasing`; unknown strings fall back to `linear` with a
  validator warning (I2).
- **D4 Groups are transform parents on their own clip.** A group is a clip
  with `mediaType: "group"` and no media. A child names it by `parentId`.
  The child's placement matrix is `parent × child`, opacity multiplies,
  and the child is clipped to the parent's window. Children stay on their
  own tracks, so I9 holds. Group-level effects and blend modes require an
  intermediate texture and land in a separate task (precomposite) after
  parenting.
- **D5 Transitions are owned by the incoming clip and resolved for both.**
  `transitionIn` keeps its place; the scene model finds the outgoing partner
  (the previous clip on the same track overlapping the window) and applies
  the complementary curve. New types: `dipToColor`, `wipe`, `push`, `slide`,
  `zoom`, each with `easing`.
- **D6 Masks are rasterized once per frame, mattes are layers.** A clip mask
  (`rect | ellipse | path`, feather, invert) rasterizes to a mask texture
  through `draw.ts` and is applied with the existing `mask/apply` shader or
  a Canvas 2D clip path. A track matte names a source clip; the compositor
  renders that layer to a texture and applies it as alpha or luma.
- **D7 Effects on clips reuse the shader catalog by id.** `ClipEffect` grows
  `glow`, `dropShadow`, `vignette`, `sharpen`, `chromaKey`, `curves`,
  `levels`, `liftGammaGain`. Each maps to one existing module in
  `packages/gpu/src/shaders/`. Canvas 2D implements `dropShadow` through
  `ctx.shadow*` and reports the rest (I7).
- **D8 Fonts ship with the product.** A bundled corpus (Inter variable plus a
  small set of OFL faces) is registered on every host by one
  `packages/timeline/src/fonts/` table. System fonts remain available and
  are marked as non-portable in the fonts endpoint and the validator.
- **D9 The server renders through Dawn on every profile.** `webgpu` moves to
  the common staged externals; the Dockerfile already installs lavapipe. A
  host with no adapter still falls back to the rough cut, and the fallback
  is logged as a warning on the job, not swallowed.
- **D10 Motion blur is sub-frame accumulation.** `samplesPerFrame` and
  `shutterAngle` render options; the compositor averages N samples inside
  the shutter window. Costs N× render time and is off by default.
- **D11 Compositions are JSON assets with a marker.** `metadata.nodetool_composition`
  on a JSON asset, the entity pattern. Shipped compositions live in
  `packages/base-nodes/nodetool/examples/compositions/`.
- **D12 Render is a workflow job.** `render_timeline` builds a one-node graph
  (`nodetool.timeline.RenderTimeline`) and runs it through the existing
  execution service, so it gets the job table, logs, progress messages and
  cancel for free.
- **D13 Time remap is a curve, and a remapped clip cannot be split.** Mirrors
  `speedBaked`: split and trim refuse a clip carrying `timeRemap` and tell
  the caller to bake first. Reverse is a remap whose curve descends.

## Desired solution

### Document model

All fields optional unless stated. Names are final; tasks reference them.

```ts
// packages/timeline/src/types.ts

type TimelineTrackType = "video" | "audio" | "overlay" | "subtitle";
type ClipMediaType = "image" | "video" | "audio" | "overlay" | "text" | "shape" | "group";

interface TimelineClip {
  // ... existing ...
  /** Group this clip belongs to. Transform composes, opacity multiplies,
   *  window clips. Must name a clip with mediaType "group". */
  parentId?: string;
  mask?: ClipMask;
  matte?: ClipMatte;
  transitionIn?: ClipTransition;          // union widened, see below
  effects?: ClipEffect[];                 // union widened, see below
  timeRemap?: ClipTimeRemap;
  /** Composition provenance, set by insert_composition. */
  compositionId?: string;
  compositionParams?: Record<string, number | string | boolean>;
}

interface ClipMask {
  kind: string;                           // "rect" | "ellipse" | "path"
  /** Normalized 0..1 in the layer's own space. */
  x?: number; y?: number; width?: number; height?: number;
  /** SVG path data, normalized 0..1 space, for kind "path". */
  d?: string;
  featherPx?: number;
  invert?: boolean;
}

interface ClipMatte {
  sourceClipId: string;
  mode: string;                           // "alpha" | "luma"
  invert?: boolean;
}

type ClipTransition =
  | { type: "crossfade"; durationMs: number; easing?: string }
  | { type: "dipToColor"; durationMs: number; color: string; easing?: string }
  | { type: "wipe"; durationMs: number; direction: string; softness?: number; easing?: string }
  | { type: "push"; durationMs: number; direction: string; easing?: string }
  | { type: "slide"; durationMs: number; direction: string; easing?: string }
  | { type: "zoom"; durationMs: number; easing?: string };

type ClipEffect =
  | ClipColorEffect | ClipBlurEffect
  | { type: "glow"; radius: number; intensity: number; color?: string }
  | { type: "dropShadow"; offsetX: number; offsetY: number; blur: number; color: string; opacity?: number }
  | { type: "vignette"; amount: number; softness: number }
  | { type: "sharpen"; amount: number; radius?: number }
  | { type: "chromaKey"; color: string; tolerance: number; softness: number; spill?: number }
  | { type: "curves"; master: CurvePoint[]; r?: CurvePoint[]; g?: CurvePoint[]; b?: CurvePoint[] }
  | { type: "levels"; inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
  | { type: "liftGammaGain"; lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number] };

interface ClipTimeRemap {
  /** Monotonic in t; sourceMs may descend (reverse). t normalized 0..1 over the clip. */
  keyframes: { t: number; sourceMs: number; easing?: string }[];
}

interface ClipTextStyle {
  // ... existing text, fontFamily, fontSizePx, fontWeight, color, align, maxWidthFrac ...
  fontStyle?: string;                     // "normal" | "italic"
  letterSpacingPx?: number;
  lineHeight?: number;                    // multiplier, default 1.2
  verticalAlign?: string;                 // "top" | "middle" | "bottom"
  stroke?: { color: string; widthPx: number };
  shadow?: { color: string; blurPx: number; offsetX: number; offsetY: number };
  background?: { color: string; paddingPx: number; radiusPx?: number };
  fill?: ShapeFill;                       // gradient text
}

interface ClipShapeStyle {
  kind: string;                           // "rect" | "ellipse" | "line" | "path" | "polygon" | "star"
  // ... existing fill, stroke, strokeWidthPx, x, y, width, height, x2, y2 ...
  d?: string;                             // kind "path", normalized 0..1
  sides?: number; innerRadius?: number;   // polygon / star
  cornerRadius?: number;
  fillStyle?: ShapeFill;                  // wins over fill when set
  dash?: number[]; lineCap?: string; lineJoin?: string;
  trimStart?: number; trimEnd?: number;   // 0..1, animatable
}

type ShapeFill =
  | { type: "solid"; color: string }
  | { type: "linear"; angle: number; stops: { offset: number; color: string }[] }
  | { type: "radial"; stops: { offset: number; color: string }[] };

interface ClipCaption {
  // ... existing words ...
  style?: CaptionStyle;
}
interface CaptionStyle {
  fontFamily?: string; fontSizeFrac?: number; color?: string; activeColor?: string;
  outline?: { color: string; widthPx: number }; bottomMarginFrac?: number;
  background?: { color: string; paddingPx: number; radiusPx?: number };
}

interface CaptionWord {
  word: string; startMs: number; endMs: number;
  kind?: "word" | "filler" | "pause";     // F16: add to Zod
  confidence?: number;                    // F16: add to Zod
}
```

Animation channels grow to:

```
offsetX offsetY scale scaleX scaleY rotation opacity wipeProgress
blur brightness saturation contrast hue temperature tint
positionX positionY anchorX anchorY
trimStart trimEnd
```

Each channel carries fold metadata (`add` | `multiply` | `replace` | `min`)
in `ANIMATED_PROPERTIES`, replacing the implicit switch in `sample.ts`.
`positionX/Y` and `anchorX/Y` are `replace` channels: the last enabled
animation in document order wins, and the validator warns when two replace
curves overlap in time.

Stagger gains `unit: "character"` and `unit: "line"`. The text rasterizer
already draws per-unit; `resolveTextStaggerContext` counts units per the
declared unit.

### Scene model

`computeActiveLayersWithHorizon` changes in four places:

1. **Groups.** Group clips are resolved first. A layer whose clip has
   `parentId` gets `parentMatrix` and `parentOpacity` from the group's own
   resolved animated props, and is dropped when the query time is outside the
   group's window. Cycles and missing parents are validator errors and are
   ignored at render (the child renders unparented).
2. **Transitions.** For each clip with a non-crossfade `transitionIn`, the
   outgoing partner is found and both layers carry `transition: {type,
   progress, role: "in" | "out", params}`. `crossfadeOpacity` becomes one
   case of `resolveTransition`.
3. **Mattes.** A layer with `matte` carries the matte source's resolved
   layer under `matteLayer`, and the source is removed from the normal stack
   (a matte source never draws itself).
4. **Layer cap.** Dropped video layers are returned as
   `droppedLayers: {clipId, reason}[]` (F17); the preview and the validator
   report them.

`resolveAnimatedLayerProps` applies fold metadata and adds `scaleX/Y`,
`positionX/Y`, `anchorX/Y`, `trimStart/End` and the extra color channels to
the synthesized `ClipEffect`. `buildTransformMatrix` accepts a parent
matrix. `clipSourceTimeSec` reads `timeRemap` when present (I5).

### Rendering

**Both compositors** (`frameCompositor.ts`, `canvas2d.ts`) gain: parent
matrix composition; transition draw rules (push and slide move the outgoing
layer, wipe uses the existing feathered mask with the outgoing layer beneath,
dipToColor draws a solid between, zoom scales both); clip masks (GPU:
rasterize through `draw.ts` into a mask texture and `maskApplyV1`; 2D:
`ctx.clip` with a feathered gradient approximation); mattes (GPU: render the
matte layer to a texture, `maskFromImageV1` + apply; 2D: `destination-in`
with an offscreen canvas); the new clip effects; and a transparent seed when
`alpha: true`.

**Precomposite** (group-level effects and blend): a group carrying `effects`
or a non-normal `blendMode` renders its children into an intermediate texture
sized to the frame, applies the group's effect chain, and blends the result
once. Without those fields a group is free.

**Motion blur**: `renderFrame(timeMs, {samplesPerFrame, shutterAngle})`
averages N composites at `timeMs + i × (shutterAngle/360) × frameMs / N`.
Implemented in the two compositors' frame entry points, so browser export,
server render and the frame preview all support it.

**Server render** (`packages/video-nodes/src/nodes/timeline/`): `webgpu`
staged on the server profile (D9); `onProgress` wired to `node_progress`;
the abort signal checked per frame; new node props `format`
(`mp4 | webm | mov | png_sequence`), `alpha`, `video_codec`, `bitrate`,
`motion_blur_samples`, `shutter_angle`. Alpha routes: `webm` → VP9 with
`yuva420p`; `mov` → `prores_ks -profile:v 4444`; `png_sequence` → a zip
asset of PNGs with straight alpha.

**Fonts**: `packages/timeline/src/fonts/catalog.ts` lists the bundled faces
(family, weights, style, file, license). `packages/timeline/fonts/` holds the
files. Registration: `@napi-rs/canvas` `GlobalFonts.registerFromPath` in the
agent preview and the server rasterizer, `@font-face` rules in the web
timeline. `resolveFontFamily(name)` returns the bundled family or the
literal name with `portable: false`. The fonts endpoint returns both sets
tagged by source.

### Agent surface

New and changed capabilities, all in `packages/agents/src/capabilities/timelines*.ts`
unless stated, all dispatched through the one bridge (I11):

| Capability / op | Purpose |
|---|---|
| `set_timeline_document` | Replace the whole document, CAS on `updated_at`, validated first, snapshot before write. F18. |
| `edit_timeline` op `animate_clip` | Accepts `preset: "custom"` with `curves` (inline keyframes) or `code` (baked server-side through `bakeCustomAnimation`). F19. |
| op `add_group`, `set_parent` | Create a group clip; parent or unparent clips. |
| op `set_transition`, `set_mask`, `set_matte`, `set_effects`, `set_time_remap` | Structural fields. |
| op `add_marker`, `delete_marker` | Headless markers. |
| op `snap_to_beats` | Given `onsets_ms[]` or `bpm + offset_ms`, move or trim named clips so boundaries land on the nearest beat within `tolerance_ms`. F23. |
| op `insert_composition` | Instantiate a stored composition at a time on a track with params. |
| `list_compositions`, `get_composition`, `save_composition` | Composition library over JSON assets. F20. |
| `render_timeline` | Run `RenderTimeline` as a job; returns `job_id`, and with `wait: true` the output asset. F21. |
| `preview_timeline_frame` gains `range {from_ms, to_ms, count}` and `sheet: true` | A tiled contact sheet as one image; a dense sample of a window. F22. |
| `compare_timeline_frames` | Two documents (or a document and a version), same timecodes, per-frame pixel difference score plus a side-by-side sheet. |
| `ui_timeline_edit` (web, mobile) | The batch twin of `edit_timeline` in the browser. F26. |

`nodetool.timelines` in `codeact/nodetool-api.ts` gains `preview`, `render`,
`setDocument`, `compositions`.

### Validation

New codes in `packages/execution/src/timeline-debug/validate.ts`:
`animation_exceeds_clip`, `stagger_compressed`, `text_illegible`
(font size below 2.5% of frame height, or contrast ratio under 3 against a
declared background), `parent_missing`, `parent_cycle`, `parent_not_group`,
`matte_source_missing`, `mask_path_invalid`, `layer_cap_exceeded`,
`font_not_portable`, `unknown_easing`, `unknown_transition`,
`unknown_effect`, `time_remap_not_monotonic`, `replace_curves_overlap`. Each
ships with a failing fixture (I12).

### Skills, evals, JTBD

`packages/system-skills/motion-graphics/SKILL.md` gains sections for
keyframes and easing grammar, groups, transitions, masks, compositions,
beat cutting, the render loop, and the new validator codes. The eval system
prompt for `timeline-tools` embeds the skill. New eval cases score motion
outcomes (stagger span fits, entrance easing decelerates, scrim below text,
beat alignment within tolerance, a preview call before the summary). A new
JTBD job `motion-title-sequence` loads `motion-graphics` and grades the
world it leaves behind.

## Non-goals

- A graph or curve editor UI. Curves get a list editor.
- An expression language (AS5).
- 3D layers, cameras, lights.
- Distributed rendering. Progress and cancel land; sharding does not.
- Linear-light compositing and HDR output. Recorded as R6 for a later plan.
- Particle systems.
- Lottie or Rive import.

## Risks

- **R1** Lavapipe throughput. A minute of 1080p with three effects may take
  several minutes. Mitigation: progress messages, cancel, and a
  `preview_scale` render option for drafts.
- **R2** Dawn instance retention keeps the event loop alive
  (`packages/gpu/src/node.ts`). The server is long-lived so this is fine;
  the render job must not be run in a one-shot child process that expects
  to exit on drain.
- **R3** Schema landing (T1) is a large PR. Mitigation: fields only, no
  behavior, one round-trip test per field, reviewed as a table.
- **R4** Parallel tasks touching `sceneModel.ts`, `canvas2d.ts` and
  `frameCompositor.ts` will conflict. Mitigation: the task list marks the
  serial chain through those files; everything else is parallel.
- **R5** Contrast-based legibility is a heuristic. Ship it as a warning, not
  an error.
- **R6** Compositing in sRGB makes glow and additive blends band. Accepted
  for this plan.
- **R7** Bundled fonts add megabytes to every artifact. Cap the corpus at
  eight families and subset where the license allows.

## Milestones

```
M0  Unblock and correct       T1 schema · T2 F16/F17 · T3 server Dawn · T4 custom animation op
                              T5 preview in CodeAct API
M1  Animation depth           T6 easing grammar · T7 channels + folds · T8 character stagger
M2  Structure                 T9 groups · T10 precomposite · T11 transitions · T12 masks/mattes
                              T13 clip effects
M3  Text, shape, fonts        T14 text style · T15 caption style · T16 shapes/paths · T17 fonts
M4  Agent surface             T18 set_document · T19 structural ops · T20 markers/beats
                              T21 compositions · T22 render_timeline job · T23 preview sheet/range/diff
                              T24 skills · T25 evals + JTBD · T26 browser batch + mobile
M5  Render quality            T27 alpha + formats · T28 motion blur · T29 time remap
                              T30 validator codes · T31 inspector UI
```

Sequencing and per-task specs: [motion-graphics-tasks.md](motion-graphics-tasks.md).

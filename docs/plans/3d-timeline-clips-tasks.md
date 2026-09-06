# 3D Clips on the Timeline — Implementation Plan

Companion to [3d-timeline-clips.md](3d-timeline-clips.md) (the technical
design). Every task below is written to be executed by an agent with no prior
conversation context. Each task's first step is: read
`docs/plans/3d-timeline-clips.md` in full. It is the contract; this file adds
sequencing, file-level pointers and acceptance criteria.

Ground rules for every task:

- After changes run the four checks in `AGENTS.md` § Mandatory Post-Change
  Verification: `npm run test:affected`, `npm run typecheck`, `npm run lint`,
  `npm run dev:nodetool -- harness gate --base origin/main`.
- `packages/timeline` is pure TypeScript: no DOM, no GPU, no three.js, no
  store imports. The render session lives in `packages/video-nodes`.
- Web UI: primitives from `web/src/components/ui_primitives/` only, tokens per
  `docs/DESIGN.md`. Never import raw MUI.
- A new check must be shown failing once (`AGENTS.md` § Claims, Checks, and
  Measurements). Every task names the test that proves it.
- Commit per task with a conventional message. Do not reformat unrelated code.

Dependency graph:

```
M1: T1 (schema) ──► T2 (scene model + channels)   T3 (render session) is independent
    T2 + T3 ──► T4 (browser source, preview, export)
    T2 + T3 ──► T5 (agent frames on the server)
    T1 + T2 ──► T6 (ops, tools, capabilities)
M2: T4 ──► T7 (add clip, drag-and-drop)   T4 + T6 ──► T8 (inspector)   T4 ──► T9 (lane thumbnails, clip frames)   T8 ──► T10 (preview orbit)
M3: T6 + T8 ──► T11 (bake)   every task ──► T12 (docs, harness registry)
```

---

## Milestone 1 — A dropped GLB previews and exports

### T1 — Schema, types, defaults, validation

**Goal:** a `model3d` clip round-trips through the wire schema and the
document types, with defaults and validator codes.

**Read first:** design §D1, §D2. `packages/protocol/src/api-schemas/timeline.ts`
(`timelineClip`, `clipShapeStyle` as the pattern), `packages/timeline/src/types.ts`
(`ClipShapeStyle`, `TimelineClip`), `packages/timeline/src/defaults.ts`,
`packages/execution/src/timeline-debug/validate.ts`.

**Steps:**

1. Add `"model3d"` to `mediaType` in the Zod schema and the type. Add
   `clipModel3DStyle` (camera, animation, lighting, lightIntensity,
   background, bake) and `model3dStyle: clipModel3DStyle.optional()` on
   `timelineClip`, with the doc comment that explains why an unlisted field
   is stripped on PATCH.
2. Mirror the types in `packages/timeline/src/types.ts` as
   `ClipModel3DCamera`, `ClipModel3DAnimation`, `ClipModel3DStyle`, and
   `model3dStyle?` on `TimelineClip`.
3. `defaults.ts`: `DEFAULT_MODEL3D_STYLE` (orbit, azimuth 45, elevation 25,
   fov 35, zoom 1, all animations, loop on, speed 1, studio lighting,
   intensity 1, transparent). Match the `RenderToImage` prop defaults.
4. `validate.ts`: `model3d_style_missing` (error) for a `model3d` clip with
   no `model3dStyle` or no asset; `bake_stale` (warning) when
   `model3dStyle.bake.dependencyHash` differs from
   `computeModel3DBakeHash(clip)` (T11 owns the real hash; land the function
   here as the style hash plus `currentAssetId`).
5. `field_stripped` already detects fields the schema drops; add a case that
   proves a `model3dStyle` survives `timelineClip.parse`.

**Acceptance:**

- `packages/execution/tests/timeline-debug.test.ts` (the validator suite): a
  `model3d` clip without a style yields
  `model3d_style_missing`; with a stale bake yields `bake_stale`; a valid
  clip yields nothing new.
- `packages/protocol` test: parsing a clip with `model3dStyle` keeps every
  field.

### T2 — Scene model kind, camera channels, orbit preset

**Goal:** the pure scene model emits `kind: "model3d"` layers, samples four
camera channels, and offers an `orbit` preset.

**Read first:** design §D3, §D4. `packages/timeline/src/render/sceneModel.ts`
(`ActiveLayer`, the `shape` branch of `computeActiveLayersWithHorizon`,
`MAX_VIDEO_LAYERS`, `DroppedLayerReason`, `clipSourceTimeSec`,
`resolveAnimatedLayerProps`), `packages/timeline/src/animation/types.ts`
(`ANIMATED_PROPERTIES`, `ANIMATED_PROPERTY_FOLD`), `animation/presets.ts`
(`spin` as the pattern), `keyframes.ts` (`KEYFRAME_PROPERTIES`).

**Steps:**

1. `ActiveLayer.kind` gains `"model3d"`; the layer carries `model3dStyle` and
   `sourceTimeSec` (from `clipSourceTimeSec` times `animation.speed`).
2. In `computeActiveLayersWithHorizon`, a `model3d` clip with a fresh bake
   (hash matches, T1's function) emits a `video` layer with
   `assetId = bake.assetId`; otherwise a `model3d` layer with
   `assetId = effectiveAssetId(clip)`. Count live `model3d` layers against
   `MAX_MODEL3D_LAYERS = 2`; over it, push a dropped layer with the new
   reason `model3d_layer_cap`.
3. Channels `cameraAzimuth` (add, 0), `cameraElevation` (add, 0),
   `cameraZoom` (multiply, 1), `cameraFov` (add, 0) in `ANIMATED_PROPERTIES`,
   the fold table and `KEYFRAME_PROPERTIES`. `resolveAnimatedLayerProps`
   returns them in `anim`.
4. Export `resolveModel3DCamera(style, anim): ClipModel3DCamera` that folds
   the sampled channels into the style's camera. Both hosts call it so the
   fold lives once.
5. Preset `orbit`: role `loop`, params `degrees` (default 360) and
   `direction`, compiles to a linear `cameraAzimuth` curve over the clip.

**Acceptance:**

- `packages/timeline/tests/sceneModel*.test.ts`: a `model3d` clip yields a
  `model3d` layer with the right `sourceTimeSec` after a trim and a 2x speed;
  a fresh bake yields a `video` layer; a stale bake yields `model3d`; a third
  active 3D clip is dropped with `model3d_layer_cap`.
- Animation tests: `orbit` over a 4 s clip samples `cameraAzimuth` 180 at 2 s;
  a keyframed `cameraZoom` folds multiplicatively with the style's zoom in
  `resolveModel3DCamera`.
- The horizon (`nextChangeMs`) is unchanged by 3D layers.

### T3 — Render session in video-nodes, multi-frame headless entry

**Goal:** `createModel3DRenderSession` in the browser core, a multi-frame CDP
entry in the page bundle, and `renderGlbFramesHeadless` on Node.
`RenderToImage` keeps its behavior.

**Read first:** design §D5. `packages/video-nodes/src/nodes/model3d/render3d-core.ts`,
`render3d-page.ts`, `render3d-headless.ts`, `render.ts`,
`scripts/bundle-render3d-page.mjs`, `packages/video-nodes/tests/model3d-render.test.ts` (covers `computeFraming`
and `orbitOffset`).

**Steps:**

1. Split `renderGlbToPng` into `createModel3DRenderSession(glb, options)`
   (load, meshopt, bounding sphere, lights, background, renderer, mixer) and
   `session.render(frame)` (camera from `ClipModel3DCamera` through the
   existing `computeFraming` and `orbitOffset`, `scene` mode picks the named
   glTF camera, `mixer.setTime(frame.timeSec)`, render, return the canvas).
   `session.animations` and `session.cameras` list the glTF's names.
   `renderGlbToPng` becomes create, render once, `convertToBlob`, dispose.
2. `render3d-page.ts`: `__nodetoolRenderGlbFrames(glbBase64, options, frames[])`
   returns one PNG per frame from one session.
3. `render3d-headless.ts`: `renderGlbFramesHeadless(glb, options, frames)`,
   one Chrome launch, calls the new entry, returns `Uint8Array[]`.
   `renderGlbHeadless` stays and delegates for one frame.
4. Rebuild the page bundle; `PACKAGE_RUNTIME_ASSETS` already registers it.

**Acceptance:**

- Existing `RenderToImage` tests pass unchanged.
- New unit test on the pure part: `scene` mode with an unknown camera name
  throws a message naming the available cameras; `frames` with two times on
  an animated fixture yield two different PNGs (the existing headless test
  harness, skipped without Chrome the way the current one is).

### T4 — Browser layer source, preview, export

**Goal:** the live preview and the browser export draw `model3d` layers.

**Read first:** design §D5 host 1. `web/src/components/timeline/preview/compositeLayers.ts`
(`CompositeSourceResolver`), `preview/gpu/types.ts` (`CompositeSource`),
`preview/gpu/compositor.ts` and `canvas2dCompositor.ts` (where a source
becomes a texture or a `drawImage`), `preview/PreviewCompositor.tsx` (the
resolver it builds, `OffscreenVideoPool` usage), `render/TimelineRenderer.ts`
(the export resolver), `Tracks/useAssetUrl.ts`, `utils/assetHelpers.ts`.

**Steps:**

1. `CompositeSource` gains `OffscreenCanvas`. Both compositors accept it
   (`copyExternalImageToTexture` and `drawImage` both take one). Add the
   test in `preview/gpu/__tests__/` that a canvas source composites.
2. `preview/Model3DLayerSource.ts`: a pool keyed by clip id, cap 2, of
   `{ session, assetId }`. `acquire(layer)` fetches the GLB by asset URL,
   caches parsed bytes per asset id (least recently used, small cap), creates
   the session with the style's lighting and background, and returns null
   while loading. `frame(layer, anim)` calls `resolveModel3DCamera` and
   `session.render` and returns the canvas. `release(clipId)` disposes.
   No WebGL is a `Model3DUnavailable` state the preview draws as an
   outlined placeholder with the clip name.
3. `PreviewCompositor.tsx` and `TimelineRenderer.ts`: the resolver's
   `model3d` branch calls the source. The export creates its own pool and
   disposes it when done.
4. `rasterClipFrames.ts` keeps throwing for `model3d`; T9 handles it.

**Acceptance:**

- A Jest test for `Model3DLayerSource` with a mocked session: the pool
  evicts at cap, returns null while loading, reuses a session across frames,
  and reports unavailable without WebGL.
- Manual: drop a GLB on an overlay track over a video clip, scrub, play,
  export, and the exported MP4 shows the model at the same pose as the
  preview at 1 s and 3 s (compare with `compare_timeline_frames` against
  T5's frames once it lands).

### T5 — Agent frames on the server

**Goal:** `preview_timeline_frame` renders `model3d` layers through headless
Chromium and reports them.

**Read first:** design §D5 host 2. `packages/agents/src/timeline-preview/frames.ts`
(the `shape` resolver branch, `PreviewLayerReport`, `PreviewDegradation`,
`Canvas2DDegradationReason`), `rasterize.ts` (`PreviewRasterizer` cache),
`packages/video-nodes/src/nodes/model3d/render3d-headless.ts` (T3's
`renderGlbFramesHeadless`).

**Steps:**

1. Before compositing, walk the requested timecodes, collect every
   `model3d` layer, group by asset id, and call `renderGlbFramesHeadless`
   once per asset with the folded camera and `sourceTimeSec` per frame. Cache
   the decoded images by `(assetId, style hash, camera, timeSec)` for the
   call.
2. The resolver's `model3d` branch returns the decoded image; `layerText`
   style reporting gains `camera` and `animation_time_sec` on the layer
   report.
3. Chrome missing or the launch failing is a `PreviewDegradation` with reason
   `model3d_unavailable`, not a thrown error; the layer is skipped.

**Acceptance:**

- `packages/agents/tests/timeline-model3d-frames.test.ts` with the headless
  call mocked: two timecodes and one asset make one call with two frames;
  the report lists the layer with its camera; a rejected launch yields the
  degradation and a frame without the layer.
- The real headless path runs under the same Chrome-gated skip as the
  `RenderToImage` test.

### T6 — Ops, tools, capabilities

**Goal:** an agent can add a 3D clip, set its style, and animate its camera
from `ui_timeline_edit` and `edit_timeline`.

**Read first:** design §D8. `packages/timeline/src/ops/op.ts`,
`ops/apply.ts` (`add_shape_clip`, `set_clip_params`),
`packages/protocol/src/api-schemas/timeline-tool-params.ts`
(`shapeStyleParams`, `withFieldNotes`), `web/src/lib/tools/builtin/timeline.ts`
(`ui_timeline_edit`), `packages/agents/src/capabilities/timelines.ts` and
`timelines.specs.ts`, `packages/agents/tests/timeline-op-parity.test.ts`.

**Steps:**

1. Ops `add_model3d_clip`, `set_model3d_style` in `op.ts` and `apply.ts`.
   `add_model3d_clip` needs an asset id, lands on the named track or the
   first `overlay` track (creating one when none), default duration 4 s,
   default style. `set_model3d_style` is a deep partial patch.
2. `model3dStyleParams` with field notes in `timeline-tool-params.ts`; the
   `animate_clip` preset list picks up `orbit` from the catalog.
3. Wire both ops through `ui_timeline_edit` and the `edit_timeline`
   capability; the parity test enforces that both hosts expose the same op
   set, so it fails until both do.
4. A `timelines.specs.ts` case: add a 3D clip, set orbit, preview a frame,
   expect a `model3d` layer in the report.

**Acceptance:**

- `timeline-op-parity` passes with the two new ops.
- `capabilities-timelines` covers add, patch and the validator error for a
  missing asset.

---

## Milestone 2 — Editing surface

### T7 — Add clip menu and drag-and-drop

**Read first:** design §D7. `web/src/components/timeline/AddClipMenu.tsx`,
`dnd/assetToClipAdapter.ts` and its tests, `web/src/utils/nodeGenerations.ts`
(how a model asset is recognized), `README.md` drop table.

**Steps:** "3D model" entry opening the asset picker filtered to models;
`assetToClipAdapter` accepts `model/*` or a `.glb` / `.gltf` name on `video`
and `overlay` lanes and builds a `model3d` clip with the default style; the
warning banner for other lanes stays.

**Acceptance:** adapter tests for accept on video, accept on overlay, reject
on audio; a `model3d` clip from the menu has the default style.

### T8 — Inspector section and keyframes

**Read first:** `Inspector/ClipShapeSection.tsx` (pattern),
`Inspector/TimelineInspector.tsx`, `Inspector/ClipKeyframes.tsx`,
`Inspector/InspectorPrimitives.tsx`, `usePersistedFold.ts`.

**Steps:** `ClipModel3DSection` with camera mode, the four orbit fields,
scene-camera and animation pickers fed by the layer source's session (a
loading state until it resolves), loop, speed, lighting, intensity,
background, and a Bake row (disabled with the reason until T11). Keyframes
section lists the camera channels for a `model3d` clip.

**Acceptance:** RTL tests: the section renders for a `model3d` clip only,
patches `model3dStyle.camera.azimuthDeg` through `patchClip`, and the
animation picker shows the names the session reports.

### T9 — Lane thumbnails and clip frames

**Read first:** `Tracks/clipThumbnails.ts`, `Tracks/useClipThumbnails.ts`,
`Tracks/filmstripCells.ts`, `preview/rasterClipFrames.ts`.

**Steps:** a `model3d` clip requests cells from the layer source at the cell
source times; `renderRasterClipFrames` handles `model3d` through the same
source so `ui_timeline_get_clip_frames` returns real frames.

**Acceptance:** thumbnails test with a mocked source; `rasterClipFrames`
test that a `model3d` clip returns one data URL per requested time.

### T10 — Orbit gesture in the preview

**Read first:** `preview/TransformGizmoOverlay.tsx`,
`preview/ClipTransformContextMenu.tsx`, `Model3DEditor.tsx` orbit math.

**Steps:** with a `model3d` clip selected, Alt-drag maps pointer delta to
azimuth and elevation, Alt-wheel to zoom, written through `patchClip` on
pointer up (one undo step per gesture). A readout shows the pose while
dragging.

**Acceptance:** RTL test that a drag of 100 px changes azimuth by the
documented degrees-per-pixel and produces one store patch.

---

## Milestone 3 — Bake and documentation

### T11 — Bake with Blender

**Read first:** design §D6. `packages/blender-nodes/src/nodes/render-animation.ts`,
`job.ts` (camera vocabulary, `orbit_degrees`), `packages/timeline/src/dependencyHash.ts`,
`web/src/stores/timeline/TimelineGenerationStore.ts` (how a generated clip
registers a job and stores a version).

**Steps:**

1. `computeModel3DBakeHash(clip)` in `packages/timeline`: style, asset id,
   and the camera curves.
2. `bake_model3d_clip` op: refuses with a message when the clip has custom
   camera keyframes; otherwise builds the `RenderAnimation` params (orbit
   terms, `orbit_degrees` from the `orbit` preset or 0, fps, frame range,
   transparent) and runs it as a generation job; on completion stores
   `model3dStyle.bake` and a clip version.
3. Inspector Bake row: run, progress, stale badge from `bake_stale`.

**Acceptance:** a test that a style edit after a bake makes the scene model
emit the live layer again; a test that the op refuses keyframed cameras with
the reason; the capability suite bakes a fixture with the runner mocked.

### T12 — Documentation and harness registry

**Steps:** `web/src/components/timeline/README.md` drop table and a "3D
clips" section; `docs/harnesses.md` entry for the 3D layer in
`preview_timeline_frame`; `packages/cli/src/harness/registry.ts` maps a diff
under `packages/video-nodes/src/nodes/model3d/` to the T3 and T5 suites;
`AGENTS.md` harness table row if a new command appears. Set this design's
status to implemented.

**Acceptance:** `npm run check:agents-docs` and `npm run capabilities:check`
pass; `harness gate --dry-run` on a diff touching `render3d-core.ts` lists
the T3 suite.

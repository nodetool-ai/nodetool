# 3D Clips on the Timeline — Technical Design

Status: implemented. The editing surface is documented in
[web/src/components/timeline/README.md](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/timeline/README.md)
§ 3D clips, the agent surface in
[docs/harnesses.md](../harnesses.md#3d-clips-in-preview_timeline_frame)
§ 3D clips in preview_timeline_frame.
Companion doc: [3d-timeline-clips-tasks.md](3d-timeline-clips-tasks.md) (implementation plan, agent-consumable tasks).

## Goal

Put a glTF scene on the timeline the way an image or a title goes on it: drop a
model on a video or overlay track, scrub it, orbit the camera, key the camera,
let its glTF animation play against the playhead, composite it over footage
with the effects, masks, mattes and transitions every other clip has, and see
the same picture in the live preview, the browser export, and the agent's
`preview_timeline_frame`. Final quality comes from a bake through Blender into
an ordinary video asset the clip then plays.

## Non-goals

- A new track type. 3D is picture, so it lives on `video` and `overlay` tracks.
- Editing geometry, materials or lights from the timeline. That is the model
  editor and `edit_model3d`, on the asset.
- Per-clip overrides of individual scene nodes. A variant is a second asset.
- More than one model per clip. Two models are two clips, composed with a
  group.
- Rendering 3D in the server ffmpeg rough cut. It stays a rough cut, and a
  baked clip is a video clip it already handles.

## What exists

| Concern | Where it lives |
| --- | --- |
| Clip kinds | `mediaType` in `packages/protocol/src/api-schemas/timeline.ts` and `packages/timeline/src/types.ts`; `text` and `shape` clips carry `textStyle` / `shapeStyle` and no asset. |
| Scene resolution | `packages/timeline/src/render/sceneModel.ts`: `computeActiveLayersWithHorizon` emits `ActiveLayer { kind: "video" \| "image" \| "text" \| "shape" \| "caption" }`, resolves groups, mattes, masks, transitions, and drops layers over `MAX_VIDEO_LAYERS` with a `DroppedLayerReason`. |
| Animation | `packages/timeline/src/animation/`: `ANIMATED_PROPERTIES` with a fold per channel, presets, and `resolveAnimatedLayerProps` sampling every channel for a layer at a time. Keyframes are curves on the `custom` preset (`keyframes.ts`). |
| Browser compositing | `web/src/components/timeline/preview/compositeLayers.ts` maps `ActiveLayer` to `CompositeLayer` for both the live `PreviewCompositor` and the `TimelineRenderer` export. A host supplies pixels through `CompositeSourceResolver`; `CompositeSource` is a video element, an image element or an `ImageBitmap`. |
| Agent frames | `packages/agents/src/timeline-preview/frames.ts` composites the same layers on `@napi-rs/canvas`; `PreviewRasterizer` draws text, shape and caption layers; the report lists degradations and dropped layers. |
| 3D rendering, browser | `packages/video-nodes/src/nodes/model3d/render3d-core.ts`: three.js `renderGlbToPng` on an `OffscreenCanvas`, orbit camera in `azimuthDeg` / `elevationDeg` / `fovDeg` / `zoom`, lighting presets, transparent background. |
| 3D rendering, server | `render3d-headless.ts` launches headless Chromium with SwiftShader and calls the bundled `render3d-page.js` over CDP. `@nodetool-ai/agents` already depends on `@nodetool-ai/video-nodes`. |
| 3D rendering, final | `packages/blender-nodes`: `nodetool.blender.RenderAnimation` renders a glTF's animation or an orbit sweep to H.264 with the same camera vocabulary. |
| 3D editor | `web/src/components/model_editor/Model3DEditor.tsx` on react-three-fiber; `Model3DCameraPose` is orbit terms around a target. |
| Generated clips | `bindingKind`, `paramOverrides`, `currentAssetId`, versions, `dependencyHash.ts` and `staleSet.ts` decide when a generated clip is stale. |

## Decisions

### D1. A `model3d` clip, not a 3D track

`mediaType: "model3d"` joins `image`, `video`, `text`, `shape`. Tracks keep
their five types. A track type changes what the mixer, ripple, drop rules and
header controls do, and none of that differs for a 3D picture. Drop rules
extend the existing table: a `model/*` or `.glb` asset lands on `video` and
`overlay` lanes.

### D2. The model is the clip's asset, the look is `model3dStyle`

The glTF lives in `currentAssetId`, exactly where an image clip keeps its
image. Replace, drag-and-drop, `effectiveAssetId`, thumbnails, versions and
`inputAssetHashes` in the dependency hash all work unchanged. Everything the
timeline adds on top is one optional block, persisted in the Zod schema (a
field absent from the schema is stripped on PATCH):

```ts
// packages/timeline/src/types.ts

export type Model3DCameraMode = "orbit" | "scene";

export interface ClipModel3DCamera {
  /** `orbit` frames the model's bounding sphere; `scene` uses a glTF camera. */
  mode: Model3DCameraMode;
  /** Orbit terms, the vocabulary of RenderToImage, the Blender job and the editor pose. */
  azimuthDeg: number;
  elevationDeg: number;
  fovDeg: number;
  /** Distance multiplier on the auto-framed fit: >1 closer. */
  zoom: number;
  /** Look-at offset from the bounding-sphere center, world units. */
  targetOffset?: [number, number, number];
  /** `scene` mode: the glTF camera's name; the first camera when absent. */
  sceneCameraName?: string;
}

export interface ClipModel3DAnimation {
  /** glTF animation name; every animation plays when absent. */
  clipName?: string;
  loop: boolean;
  /** Playback multiplier on top of the clip's own speed / time remap. */
  speed: number;
}

export interface ClipModel3DStyle {
  camera: ClipModel3DCamera;
  animation: ClipModel3DAnimation;
  lighting: "studio" | "soft" | "flat";
  lightIntensity: number;
  background: { transparent: true } | { transparent: false; color: string };
  /**
   * A Blender render of this clip at a given style. The scene model plays it
   * as video while `dependencyHash` matches the live style; a style edit
   * makes it stale and the live layer draws again.
   */
  bake?: { assetId: string; dependencyHash: string };
}
```

`TimelineClip.model3dStyle?: ClipModel3DStyle`. Defaults live in
`packages/timeline/src/defaults.ts` next to the text and shape defaults.

### D3. Time: the glTF animation follows the clip's source time

`clipSourceTimeSec(clip, timeMs)` already resolves in point, speed and time
remap for video. A 3D layer uses the same number, times `animation.speed`, as
the `AnimationMixer` time. Trimming hides animation instead of deleting it,
a split copies the style and moves `inPointMs`, and a reversed remap plays the
animation backwards, the same as video. With `loop` on, the mixer wraps at the
animation's duration; off, it holds the last frame.

### D4. Camera moves are animation channels

Four channels join `ANIMATED_PROPERTIES`, each additive on top of
`model3dStyle.camera`:

| Channel | Fold | Identity |
| --- | --- | --- |
| `cameraAzimuth` | add | 0 |
| `cameraElevation` | add | 0 |
| `cameraZoom` | multiply | 1 |
| `cameraFov` | add | 0 |

Keyframes come free: `KEYFRAME_PROPERTIES` gains the four, the inspector's
Keyframes section keys them at the playhead, and `keyframeValueAt` samples
them. One preset joins the catalog: `orbit` (role `loop`, `degrees` 360,
`direction`) drives `cameraAzimuth`, so "make it a turntable" is one
`animate_clip` call. The channels are ignored on any layer that is not
`model3d`, the way `wipeProgress` is ignored without a wipe.

### D5. One render session, four hosts

`render3d-core.ts` becomes a session: load once, render many.

```ts
// packages/video-nodes/src/nodes/model3d/render3d-core.ts

export interface Model3DRenderFrame {
  timeSec: number;
  camera: ClipModel3DCamera;   // already folded with the sampled channels
  width: number;
  height: number;
}

export interface Model3DRenderSession {
  /** Names of the glTF's animations and cameras, for the inspector and the validator. */
  readonly animations: readonly string[];
  readonly cameras: readonly string[];
  /** Draws one frame into the session's canvas and returns it. */
  render(frame: Model3DRenderFrame): OffscreenCanvas;
  dispose(): void;
}

/** Everything a session fixes at creation. Two layers share a session only
 * when these are equal, so the key of every pool and every headless group is
 * `assetId` plus this object, never `assetId` alone. */
export interface Model3DSessionOptions {
  lighting: ClipModel3DStyle["lighting"];
  lightIntensity: number;
  background: ClipModel3DStyle["background"];
  animation: ClipModel3DAnimation;
}

export function createModel3DRenderSession(
  glb: Uint8Array,
  options: Model3DSessionOptions
): Promise<Model3DRenderSession>;
```

`animation` selects the mixer's actions: `clipName` plays that one glTF
animation, absent plays all of them. `render` sets absolute time, so a scrub
backwards after the end is a plain `setTime`. With `loop` on, the time wraps at
the longest selected animation's duration; off, it clamps to the last frame.
A style edit to any session option disposes the session and creates a new
one, in the browser pool and in the headless group alike, because a mixer
whose actions were rebuilt mid-session is the same picture as a fresh one and
harder to prove.

`renderGlbToPng` becomes a one-frame call on a session, so `RenderToImage`
keeps its behavior and its tests. The hosts:

1. **Live preview and browser export.** `web/src/components/timeline/preview/Model3DLayerSource.ts` holds a session per active `model3d` layer, keyed by clip id and re-created when the clip's asset or session options change, in a pool capped like the video pool (a WebGL context per session, browsers allow about sixteen). It loads the GLB through the asset URL, caches parsed scenes per asset id, and its resolver returns the session's canvas as the layer's `CompositeSource`. `CompositeSource` grows an `OffscreenCanvas` member; the WebGPU compositor's `copyExternalImageToTexture` and the Canvas2D fallback both take one directly, so there is no per-frame bitmap transfer. Export steps the same resolver at exact frame times, so it is deterministic.
2. **Agent frames.** `frames.ts` gathers the `model3d` layers across every requested timecode, groups them by asset id plus `Model3DSessionOptions`, and renders each group in one headless Chromium page through a new `renderGlbFramesHeadless` (one launch, N frames, PNG each). The PNGs decode with `@napi-rs/canvas` `loadImage` and join the layer list like a rasterized shape. No Chrome on the host is a `PreviewDegradation` with reason `model3d_unavailable`; the layer is left out and the report says so, so an agent never mistakes a missing renderer for an empty clip.
3. **Clip frames for the agent in the browser** (`ui_timeline_get_clip_frames`, `rasterClipFrames.ts`) and **lane thumbnails** use host 1's source.
4. **Bake** (D6) is Blender, not the session, and is the only host that draws with a different renderer.

Browser and server share the core, so the tone mapping, color space and
lighting match to the pixel, the way text does today.

### D6. Bake with Blender for final quality

A "Bake" action in the inspector and a `bake_model3d_clip` op run
`nodetool.blender.RenderAnimation` and store the result in
`model3dStyle.bake`. The scene model emits a `video` layer from `bake.assetId`
while `bake.dependencyHash` matches the live document and the live `model3d`
layer otherwise, so a stale bake is never played silently. The clip's existing
version history holds the bakes.

**Time origin.** A bake is the clip's evaluated picture, clip-local: frame `i`
of the video is what the live layer draws at timeline time
`clip.startMs + 1000 * i / fps`, with in point, speed, time remap,
`animation.speed` and the camera curves already applied. The scene model
therefore emits the baked `video` layer with
`bakeSourceTimeSec = (timeMs - clip.startMs) / 1000`, and every video decoder
seeks by that field when it is present instead of `clipSourceTimeSec(clip,
timeMs)`: the live preview, the browser export, and the agent frame path's
`decodeVideoFrameAt`. A trimmed clip whose source starts at 5 s bakes into a
video that starts at 0 s and plays from 0 s in all three.

**Producer.** The existing job renders consecutive scene frames at the output
fps, which cannot express a trimmed, sped-up, reversed or looped clip. The
bake sends Blender the evaluated sample list instead: `render_animation`
gains `frame_times: number[]`, one model time in seconds per output frame,
plus `animation_name` and the camera per frame. The timeline side computes
the list with the same functions the live layer uses: `clipSourceTimeSec` at
each output frame, times `animation.speed`, wrapped or clamped by
`animation.loop` against the selected animation's duration, which
`packages/model3d` reads from the glTF's sampler input accessors. Blender
then renders one still per entry, setting the scene frame from the model time
(`frame_set` with the subframe), the orbit camera from that entry's camera,
and the selected action as the only one playing, and the frames are muxed
with ffmpeg. This is the same still-per-frame loop the transparent bake needs,
so both bake formats share one op path and the H.264 branch becomes the mux
of an opaque sequence. A reversed remap is a decreasing list; a loop past the
end wraps in the list; neither needs anything from Blender beyond `frame_set`.

**Dependency hash.** `computeModel3DBakeHash(clip, sequence)` covers every
input the picture depends on: `model3dStyle` without `bake`, the asset id, the
clip's animations (the camera curves and the `orbit` preset among them),
`inPointMs`, `outPointMs`, `durationMs`, `speed`, the time remap, and the
sequence's fps, width and height. A change to any of them makes the bake
stale; a change to the clip's start, track, transform, opacity, effects, mask
or matte does not, because those apply to the baked layer the way they apply
to any video.

**Output format.** The sampled producer writes a PNG sequence, RGBA under
`film_transparent`. An opaque bake muxes it to MP4/H.264 `yuv420p`; a
transparent bake encodes it to WebM VP9 `yuva420p`, the alpha format
`packages/video-nodes/src/nodes/timeline/outputFormats.ts` already declares,
both through the bounded ffmpeg runner the timeline node uses. Until the
transparent encode ships (T13), `bake_model3d_clip` refuses a transparent
style and says so. A browser that cannot decode the alpha bake (the video element errors
or reports no alpha) falls back to the live layer with a
`bake_undecodable` degradation rather than drawing an opaque box over footage.

**Camera.** Blender's orbit is keyframed only when the model has no animation
of its own (`render_animation.py`, the `not animated and mode == "orbit"`
branch), so an animated model with the `orbit` preset would bake without its
camera move. The sampled producer above removes that branch: each
`frame_times` entry carries its own resolved `ClipModel3DCamera` (the style
folded with the sampled channels, the same `resolveModel3DCamera` the live
layer calls), and the op places the orbit camera per still. A static camera,
the `orbit` preset and custom camera keyframes are all just different lists;
`scene` mode uses the glTF camera and ignores the orbit terms. Nothing is
refused for its camera.

### D7. Editing surface

- **Add.** `AddClipMenu` gets "3D model" (pick a glTF asset). `assetToClipAdapter` accepts `model/*` content types and `.glb` names for `video` and `overlay` lanes.
- **Inspector.** `ClipModel3DSection`: camera mode, the four orbit fields, a scene-camera picker and an animation picker filled from the session's `cameras` and `animations`, loop and speed, lighting and intensity, background, and Bake with its stale state. The Keyframes section offers the camera channels.
- **Preview.** With a `model3d` clip selected, Alt-drag on the preview orbits (`azimuthDeg`, `elevationDeg`), Alt-wheel changes `zoom`, and either writes `model3dStyle.camera` through `patchClip` like the 2D transform gizmo writes `transform`.
- **Lane.** A filmstrip like video, cells from the layer source at a few source times.

### D8. Agent surface

- Ops in `packages/timeline/src/ops/op.ts`, applied in `apply.ts`, parsed by `timeline-tool-params.ts`: `add_model3d_clip { assetId, trackId?, startMs?, durationMs?, style? }`, `set_model3d_style { target, patch }`, `bake_model3d_clip { target }`. Both `ui_timeline_edit` and the `edit_timeline` capability reach them through the shared op union.
- `preview_timeline_frame` reports a `model3d` layer with the camera it drew and the animation time, next to the text a text layer reports.
- `validate_timeline` adds `model3d_style_missing` (a `model3d` clip without a style or asset) and `bake_stale` (a bake whose hash no longer matches, as a warning).
- The model3d capability suite and the timeline capability suite each gain a case; `harness gate` runs them on a diff under either package.

## Risks

- **R1. GPU-less browsers.** The session runs on WebGL; a machine without it gets the same `model3d_unavailable` degradation the server reports, drawn as an outlined placeholder in the preview. Nothing else in the timeline breaks.
- **R2. Context limits.** One WebGL context per active 3D layer, capped at two, over the existing video cap. A third active 3D clip is reported as a dropped layer with reason `model3d_layer_cap`.
- **R3. Server preview latency.** One Chromium launch per `preview_timeline_frame` call with 3D layers, about a second, then per-frame render under SwiftShader. Acceptable for a tool that returns a handful of frames; the report carries the render time.
- **R4. Large models.** A GLB is fetched and parsed once per asset per session pool and evicted least recently used. The inspector shows a loading state until the session resolves.
- **R5. Bake fidelity.** Blender's lighting presets and three's are not the same picture. The bake is the intended look, the live layer is the proxy, and the inspector says so.
- **R6. Alpha bakes in the browser.** VP9 with alpha decodes in Chromium and Firefox and not in Safari. The `bake_undecodable` fallback keeps the live layer on screen there, and the export still runs in Chromium.

## Rollout

1. Schema, defaults, validation, and the render session with tests.
2. Scene model kind, camera channels, orbit preset, browser layer source: a dropped GLB previews and exports.
3. Agent frames on the server, ops and tools, capability suites.
4. Inspector, add menu, drag-and-drop, lane thumbnails, preview orbit gesture.
5. Opaque bakes with Blender, with the orbit-on-animated-model prerequisite.
6. Transparent bakes through the PNG sequence and ffmpeg.

Steps 1 and 2 are a shippable slice: a glTF asset on an overlay track,
rendered over footage with a transparent background, its animation scrubbed
with the playhead, exported.

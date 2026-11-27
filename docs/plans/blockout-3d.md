# Blockout 3D: Technical Design

Status: the web and agent paths are implemented. The native viewport is not.
The clip, camera channels and render hosts this builds on are described in
[3D Clips on the Timeline](3d-timeline-clips.md). The agent workflow is the
shipped skill
[blockout-3d](https://github.com/nodetool-ai/nodetool/blob/main/packages/system-skills/blockout-3d/SKILL.md).

## Goal

A user or an agent builds a rough 3D set from boxes and mannequins, films it
with a keyed camera on a timeline clip, and renders the span as a grey
reference video. A video model that takes reference video follows the layout
and the camera move and paints every surface itself.

## Terms

- A **set** is a glTF model asset built from primitives and figures.
- A **blockout clip** is a `model3d` clip whose asset is a set and whose camera
  is in `free` mode.
- A **reference** is the grey video rendered from a blockout clip's span,
  stored on the clip as `model3dStyle.reference`.
- A **shot blockout** is a blockout clip stamped with a storyboard shot's
  `storyboardBoardId` and `storyboardShotId`.

No new document type and no new track type exist. A blockout reuses the clip,
keyframe, take and dependency-hash code.

## What is implemented

| Part | Where |
|---|---|
| Figures (`male`, `female`, `child`, five poses, `entityId`, `label`) and named cameras as `add_object` kinds, with `set_figure` and `set_camera` | `packages/model3d/src/` |
| `free` camera mode: position, target, roll, lens. Eight keyed channels folded onto the authored camera by one function | `packages/timeline/src/model3d.ts` |
| Ten camera move presets as pure functions that write keys | `packages/timeline/src/model3dCameraMoves.ts` |
| Lens in mm, keying the free camera at a time, pose report | `packages/timeline/src/model3dCameraKeys.ts` |
| Ops `set_model3d_style` (with `keyAtMs`, `keyEasing`), `apply_model3d_camera_move`, `render_model3d_reference` | `packages/timeline/src/ops/`, contracts in `packages/protocol/src/api-schemas/timeline-tool-contracts.ts` |
| Reference hash, staleness and frame plan | `packages/timeline/src/model3dReference.ts` |
| Server reference render: headless three.js frames encoded to MP4 and stored as an asset | `packages/agents/src/capabilities/timeline-reference.ts` |
| Render passes `beauty`, `clay`, `depth`, `normal` in the shared render session | `packages/video-nodes/src/nodes/model3d/render3d-core.ts` |
| `preview_timeline_frame` `pass` argument | `packages/agents/src/timeline-preview/`, `packages/agents/src/capabilities/timelines.ts` |
| One-sentence camera move description for prompts | `packages/timeline/src/model3dCameraDescription.ts` |
| Routing a take by the model's declared tasks | `packages/timeline/src/model3dBlockout.ts` |
| Shot link helpers (`blockoutClipForShot`, `blockoutCandidatesForClip`) | `packages/timeline/src/shotLink.ts` |
| Web: free camera fields, move menu, reference section, shot panel action | `web/src/components/timeline/Inspector/`, `web/src/components/timeline/shot/` |
| Agent skill | `packages/system-skills/blockout-3d/SKILL.md` |
| Gate coverage | `timeline-model3d` harness in `packages/cli-harness/src/harness/registry.ts` |

### Agent surface

All three ops run through `edit_timeline` headlessly and through the matching
`ui_timeline_*` tool in the open editor.

- `set_model3d_style {target, patch, keyAtMs?, keyEasing?}`. A free camera
  patch takes `position`, `target`, `rollDeg` and one of `fovDeg` or
  `focalLengthMm`. The lens in mm assumes a full-frame sensor and is stored as
  `fovDeg`. Without `keyAtMs` the patch changes the base pose. With `keyAtMs`
  the pose fields become keyframes at that time and the rest of the patch
  still goes to the base.
- `apply_model3d_camera_move {target, move, amount?, startMs?, durationMs?,
  easing?}`. The move starts from the camera as it stands at `startMs`, so
  moves chain. It replaces the keys its channels had inside the span. The
  result carries the pose at both ends.
- `render_model3d_reference {target, pass?}`. `pass` is `clay` (default),
  `depth` or `normal`. The result carries `reference {assetId,
  dependencyHash, pass}` and `cameraMove`.

Each refusal names the field and the fix. A move on an orbit camera, for
example, answers with the `set_model3d_style` patch that puts the clip in free
mode.

`preview_timeline_frame` takes `pass`. A pass other than `beauty` applies to
`model3d` layers only. Any other layer draws as usual and is reported as a
`render_pass_not_applied` degradation, and a baked 3D clip is drawn live so the
pass applies to it. `times_ms` returns one frame per timecode and `sheet`
returns one contact sheet, which covers a per-shot review.

## Decisions

**D1. Web first.** The project owner chose the web path over the plan's
native-first recommendation. The free camera, the move menu, the reference
render and the shot action are in the web timeline. The native app stores and
keys the same clips and draws none of them.

**D2. The reference is a clay video, with a prompt fallback.** A model whose
catalog entry declares `reference_to_video` is sent the reference video and an
instruction to follow its camera, framing and staging and to ignore its grey
look. Any other model is sent no reference, and the camera move sentence is
appended to the prompt. The choice reads the model's declared tasks, never its
name. `depth` and `normal` passes exist for models that want them. The styled
first-and-last-frame route from the plan is not built.

**D3. The clip owns the camera.** The camera path is keyframes on the
`model3d` clip, and a shot links to the clip. This reuses keyframes, undo and
takes. A storyboard has no camera editor of its own.

**D4. Preset poses only.** A figure has five poses and its joints are not
addressable. Gestures go in the prompt.

**D5. Camera names survive the glTF loader.** three's GLTFLoader rewrites a
node name with a space ("Camera 2" becomes "Camera_2"). `selectSceneCamera`
matches the name the document holds first, then the rewritten form, so a
`scene` camera is picked by the name `get_model3d` reports.

## What remains

1. **Native viewport and panels.** The native timeline has no 3D renderer, no
   free camera controls and no Blockout panel. Phases P4 and P5 of the plan
   are untouched.
2. **Model adherence spike.** Nobody has measured how closely each video model
   follows a clay reference. That needs paid generations: three blockouts
   (static two-shot, push in, orbit with a walking figure) through each model
   that declares `reference_to_video`, scored on layout and camera adherence.
   D2 rests on a guess until this runs.
3. **A headless shot link.** No op stamps a blockout clip with a shot. An
   agent renders the reference and calls `generate_video_from_references`
   itself. The link and the shot action exist only in the web editor.
4. **Joint posing.** Not built. It is worth building only if the spike shows
   models follow a posed figure.
5. **Blender free-camera render.** The bake path accepts a free camera, and
   that render was never executed, because no Blender is installed on the
   development hosts or in CI.
6. **Native op conformance.** The new ops have TypeScript parity fixtures
   (`packages/timeline/src/testing/ops.ts`). The native conformance run needs
   the native binaries and was not extended.

## Verification

`nodetool harness gate` runs the `timeline-model3d` harness on a change to the
camera, move, reference or preview files. Its suites include
`packages/timeline/tests/ops.model3dCamera.test.ts` and
`packages/agents/tests/timeline-blockout-path.test.ts`. The second builds a
set, adds a free-camera clip, applies two moves and renders clay frames in
headless Chromium, then checks that a push in widens the figure on screen.
The headless part skips on a host with no Chrome.

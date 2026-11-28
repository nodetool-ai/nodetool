---
name: blockout-3d
description: "Stage a shot in 3D before generating it: build a grey set at real scale, film it with a free camera and camera move presets on a timeline 3D clip, review the frames in clay, and render the reference video a video model follows. Use when a shot needs a specific layout, framing or camera move. For editing the 3D model itself use nodetool-3d-scene."
---

# Block out a shot in 3D

A blockout is a grey set filmed by a timeline `model3d` clip. The clip's render
is a reference video. A video model that takes reference video follows its
layout and camera, and paints every surface itself.

Use a blockout when the prompt alone cannot hold the shot: who stands where,
what the lens sees, how the camera moves. Skip it for a single static framing
that a first-frame image already fixes.

The 3D model is edited with `edit_model3d` (`nodetool-3d-scene` has every
verb). The camera lives on the timeline clip and is edited with
`edit_timeline`. Nothing here needs an open editor.

## Steps

1. **Build the set.** `create_model3d`, then one `edit_model3d` call. The scene
   is +Y up, in meters, ground at y = 0. Use real sizes: a door is 2 m tall, a
   table top is at 0.75 m, a seat at 0.45 m, a car is about 4.5 m long. A
   `plane` is the floor, `box` objects are walls and furniture.
2. **Place the cast.** `add_object {kind: "figure"}` per character, with
   `body`, `pose` and `position`. Set `entityId` and `label` on every figure.
   They tie the mannequin to the cast entity the prompt names.
3. **Add the clip in free mode.** `add_model3d_clip` with
   `style.camera.mode: "free"`, a `position` and a `target` in meters, and a
   lens.
4. **Frame the first shot.** `set_model3d_style` with `keyAtMs: 0` keys the
   pose at the clip's start.
5. **Apply moves.** `apply_model3d_camera_move` per move. Each starts from the
   camera as it stands at `startMs`, so moves chain.
6. **Review in clay.** `preview_timeline_frame` with `pass: "clay"` and one
   timecode per beat. Fix the set or the camera and look again.
7. **Render the reference.** `render_model3d_reference` stores a grey video on
   the clip and returns its asset id and a one-sentence `cameraMove`.
8. **Generate.** Send the reference to a model that takes reference video, or
   put `cameraMove` in the prompt for one that does not.

## The set and the camera

```json
{"ops": [
  {"op": "add_object", "kind": "plane", "name": "floor"},
  {"op": "set_transform", "target": "floor", "scale": [6, 6, 1]},
  {"op": "add_object", "kind": "box", "name": "counter", "position": [0, 0.45, -1]},
  {"op": "set_transform", "target": "counter", "scale": [2, 0.9, 0.6]},
  {"op": "add_object", "kind": "figure", "name": "ana", "body": "female",
   "pose": "stand", "position": [0, 0, 0], "entityId": "<entity id>", "label": "Ana"}
]}
```

Then on the timeline, in one `edit_timeline` call:

```json
{"timeline_id": "<id>", "ops": [
  {"op": "add_model3d_clip", "assetId": "<model asset id>", "durationMs": 4000,
   "style": {"camera": {"mode": "free", "position": [0, 1.6, 4],
             "target": [0, 1.4, 0], "focalLengthMm": 35}}},
  {"op": "apply_model3d_camera_move", "target": "<clip id>", "move": "pushIn",
   "amount": 0.4, "startMs": 0, "durationMs": 2500, "easing": "easeInOut"},
  {"op": "apply_model3d_camera_move", "target": "<clip id>", "move": "orbit",
   "amount": 30, "startMs": 2500, "durationMs": 1500}
]}
```

The first op's result carries the clip id. Split the call there when the id is
not known yet.

A free camera is `position` (the eye), `target` (the point it looks at),
`rollDeg`, and a lens given once as `focalLengthMm` or `fovDeg`. The lens is on
a full-frame sensor, so `fovDeg` is the vertical angle: 24 mm is 53 degrees,
35 mm is 38, 50 mm is 27, 85 mm is 16. Passing both lens fields is refused.

`set_model3d_style` without `keyAtMs` changes the base pose under every key.
With `keyAtMs` (milliseconds from the clip's start) it writes keyframes at that
time and leaves the base alone. `keyEasing` eases the segment that ends at the
key. The result lists `cameraKeyTimesMs`.

```json
{"op": "set_model3d_style", "target": "<clip id>", "keyAtMs": 0,
 "patch": {"camera": {"position": [0, 1.6, 4], "target": [0, 1.4, 0]}}}
```

## Camera moves

`amount` is in the move's own unit and a negative amount reverses the move.
Distances are a fraction of the eye-to-target distance at the start of the
move, so a push of 0.5 from 4 m away ends 2 m away.

| `move` | Unit | Default | Positive amount |
|---|---|---|---|
| `pan` | degrees | 30 | Turns right, the eye stays put |
| `tilt` | degrees | 15 | Turns up, the eye stays put |
| `orbit` | degrees | 45 | The eye circles to its right around the target |
| `dutch` | degrees | 15 | The horizon turns clockwise |
| `pushIn` | fraction of distance | 0.3 | The eye moves toward the target, at most 0.95 |
| `truck` | fraction of distance | 0.25 | Eye and target slide right |
| `crane` | fraction of distance | 0.25 | The eye rises and keeps its target |
| `pedestal` | fraction of distance | 0.25 | Eye and target rise together |
| `dollyZoom` | fraction of distance | 0.4 | The eye moves in while the lens widens, at most 0.95 |
| `zoom` | focal length multiplier | 1.5 | Above 1 zooms in, must be above 0 |

`startMs` defaults to 0 and `durationMs` to the rest of the clip. Both are
measured from the clip's start and must stay inside it. `easing` takes the
timeline's easing names, such as `linear`, `easeInOut` and `easeOut`. A move
replaces the keys its own channels had inside its span, so reapplying a move
with a new amount is a correction, not a second move. The result carries the
camera at the start and the end as `from` and `to`.

## Framing in numbers

- Eye height is 1.6 m for a standing adult. Put `position[1]` there and
  `target[1]` at 1.4 to 1.5 m for a level shot of a standing figure. A seated
  eye is 1.2 m. A child's eye is 1.1 m.
- A low angle is an eye at 0.5 m with the target at 1.5 m. A high angle is an
  eye at 2.5 m or more with the target at 1 m.
- Wide shot, a 1.7 m figure head to toe: 35 mm from 3 m, or 24 mm from 2 m.
- Medium shot, waist up: 50 mm from 2 m.
- Close-up, head and shoulders: 85 mm from 1.5 m.
- Two figures in conversation stand 0.8 to 1.2 m apart. An over-the-shoulder
  shot puts the eye 0.5 m behind and 0.3 m to the side of the near figure, at
  50 mm, with the target on the far figure's head.
- Keep a move readable: an orbit of 30 to 60 degrees or a push of 0.3 to 0.5
  over 3 to 5 seconds. A pan faster than 30 degrees a second smears in the
  generated video.

## Review

```json
{"timeline_id": "<id>", "times_ms": [0, 2500, 3900], "pass": "clay", "sheet": true}
```

`pass` is `beauty` (the clip's own lighting, the default), `clay` (one grey
matte material under a fixed light), `depth` (near white, far black) or
`normal`. `times_ms` returns one frame per timecode, and `sheet: true` returns
them as one contact sheet. A pass applies to 3D layers only. Any other layer
draws as usual and is listed under `degraded`, with a reason that says the
pass was not applied.
A frame reported as `model3d_unavailable` means the host has no headless
Chrome, so no 3D layer was drawn. Ask the user to install Chrome from the
Package Manager, or to run `nodetool runtime add chrome`.

Check each frame for three things: every figure is inside the frame at the
start and the end of each move, no wall sits between the eye and the subject,
and the horizon is level unless a `dutch` was meant.

## Reference and generation

```json
{"op": "render_model3d_reference", "target": "<clip id>", "pass": "clay"}
```

The result carries `reference` (`assetId`, `dependencyHash`, `pass`,
`assetRevision`) and `cameraMove`. The reference covers the clip as it stands
and goes stale when the set is saved (`edit_model3d`), or when the camera, the
span or the sequence settings change. Render it again after any such edit. A
call on a current reference renders nothing and returns the stored one. Pass
`"force": true` to render it anyway.

Pick the model with `find_model` and `capability: "reference_to_video"`.

- **The model takes reference video.** Call `generate_video_from_references`
  with `reference_files: ["asset://<reference assetId>"]`, plus the cast and
  location images. In `prompt`, describe the action and the look, and state
  that the grey video gives the camera movement, framing and staging and that
  its grey look must not be copied.
- **No such model is available.** Send no reference. Append `cameraMove` to
  the prompt and name each figure's place from its `label`.

In the editor, a storyboard shot's clip is linked to the blockout clip that
overlaps it, and generating the shot applies the same rule. That link is made
in the editor's shot panel. There is no headless op for it, so a headless run
generates through the two routes above and places the result with
`add_media_clip`.

## Limits

- A figure has five poses: `stand`, `sit`, `walk`, `run`, `lie`. Its joints
  cannot be posed, so a gesture or a held prop is described in the prompt.
- Figures do not move along a path. A walk across the set is one pose plus
  prompt wording.
- The reference guides layout and camera. The model invents every surface,
  face, costume and light, so identity comes from the cast and location
  references, not from the blockout.
- How closely a model follows the reference varies by model. Compare the
  generated take against the clay frames before accepting it.
- The longest side of a reference is at most 1280 px.

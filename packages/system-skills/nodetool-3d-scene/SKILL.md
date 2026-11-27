---
name: nodetool-3d-scene
description: "Build, edit, validate or render a NodeTool 3D model: glTF primitives, transforms, lights, material colors, blockout sets with posed figures and named cameras, generated meshes, and headless Blender renders. For a playable 3D game, use native-game."
featured: true
---

# Work a NodeTool 3D model

A 3D model is a `.glb` or `.gltf` **asset**, addressed by its asset id. The
capabilities edit the stored glTF in place and save it back over the same asset,
so the id stays valid and an open editor reloads it.

For a playable game, 2D or 3D, use `native-game`: it authors 3D games with
`dimension: "3d"`. For a 3D clip inside a cut, build the model here and place it
on a timeline.

## The loop

1. **Find it.** `list_model3ds` returns asset id, name, content type and size.
   Nothing to start from: `create_model3d {name, ops?}` makes an empty glTF
   scene and can apply the whole scene in the same call.
2. **Read it.** `get_model3d {model_id}` lists every object with its uuid, name,
   type, visibility, transform and material color, plus the scene's world-space
   bounds. A figure also lists its `figure` (body, pose, height, entityId,
   label) and a camera its `camera` (fovDeg, aspectRatio, znear, zfar). Call
   this before editing, for the uuids.
3. **Edit.** `edit_model3d {model_id, ops: [...]}`. Operations run in order.
   Anything they do not name — meshes, textures, skins, animations — is kept, so
   an imported model survives an edit.
4. **Validate.** `validate_model3d {model_id | document}`.
5. **Render**, when a picture is asked for. `render_model3d {model_id}` goes
   through headless Blender, honors scene cameras and lights, and stores a PNG
   asset. It needs Blender on the server and is not offered on the cloud
   profile. `engine` is `eevee` (default, fast) or `cycles` (slower);
   `camera_mode` is `auto`, `scene` or `orbit`. A Cycles render blocks the call,
   so pass `background: true` to get a `generation_id` at once and collect the
   PNG with `await_generation`.

## A real mesh

The ops add primitives only. For an object with real geometry, generate one:
`run_node` with `nodetool.model3d.TextTo3D {model, prompt}` or
`nodetool.model3d.ImageTo3D {model, image}` returns a `model_3d` output. Read
`get_node_info` first for the `model` field's shape. These call a paid
provider, so confirm with the user before generating. The other
`nodetool.model3d.*` nodes (`Decimate`, `RepairMesh`, `FormatConverter`,
`Transform3D`, …) and the `nodetool.blender.*` nodes process a mesh inside a
workflow.

## `edit_model3d` ops

| Op | Fields |
|---|---|
| `add_object` | `kind`: `box`, `sphere`, `plane`, `cylinder`, `torus`, `directionalLight`, `pointLight`, `figure`, `camera`. Optional `name`, `position`. A figure also takes `body`, `pose`, `height`, `color`, `entityId`, `label`. A camera also takes `fovDeg`, `lookAt`, `aspectRatio`, `znear`, `zfar` |
| `delete_object` | `target` |
| `set_transform` | `position`, `rotation` (Euler **degrees**), `scale`, each `[x, y, z]` |
| `set_visibility` | `visible` |
| `rename_object` | `target`, `name` |
| `set_material_color` | `color` as a CSS hex string, meshes and figures |
| `select_object` | `target`, or `null` to clear |
| `set_figure` | `target`, and any of `body`, `pose`, `height`, `color`, `entityId`, `label` |
| `set_camera` | `target`, and any of `position`, `lookAt`, `fovDeg`, `aspectRatio`, `znear`, `zfar` |

`target` is a uuid or a name. Object ids are stamped into
`node.extras.nodetool_id`, because glTF addresses nodes by array index and a
delete renumbers them. Duplicate names make addressing ambiguous, which
`validate_model3d` warns about.

`delete_object` keeps the file valid: an animation left with no channels is
removed, and so is a skin that lost a joint, which leaves its mesh in the bind
pose. `set_material_color` recolors only the named object, copying a material
or mesh it shares with another object first.

These are the `ui_3d_*` verbs with no editor open. The operations, the units and
the addressing live in `@nodetool-ai/model3d`, shared with the browser editor, so
a model built headlessly opens there unchanged. Headlessly, a light is a
`directionalLight` or `pointLight` and a material can only be recolored.
Light settings, other material fields and parenting need the open editor:
`ui_3d_set_light`, `ui_3d_set_material`, `ui_3d_set_parent`.

## Blockout sets

A blockout is a rough set that a timeline `model3d` clip films as a reference
for a video model: boxes for walls and furniture, figures for the cast, and
named cameras for the views. The scene is +Y up, in meters, with the ground at
y = 0.

**Figures.** `add_object {kind: "figure"}` adds a jointed mannequin of plain
meshes. Its origin is on the ground under the pelvis, it faces +Z, and its left
side is +X. Turn it with `set_transform` `rotation: [0, degrees, 0]`.

| Field | Values |
|---|---|
| `body` | `male` (1.8 m, default), `female` (1.65 m), `child` (1.2 m) |
| `pose` | `stand` (default), `sit`, `walk`, `run`, `lie` |
| `height` | Standing height in meters, 0.3 to 3. Defaults to the body's own |
| `color` | CSS hex. Default `#b8b8b8` |
| `entityId` | The id of the cast entity the figure stands in for. `null` clears it |
| `label` | A character name or role. `null` clears it |

Every pose rests on y = 0. `sit` leaves the seat at knee height, so put a box
under it. `lie` is on the back with the head toward -Z. `set_figure` changes
any of these on an existing figure, and a new `body` takes that body's default
height unless `height` is given. A figure is one object: its joints are not
listed and cannot be addressed. Set `entityId` and `label` on every cast
figure, because they are how a later prompt says who stands where.

**Cameras.** `add_object {kind: "camera"}` adds a perspective camera that looks
down its own -Z. `position` places it and `lookAt: [x, y, z]` turns it to face
a point, applied after the position. `fovDeg` is the vertical field of view,
default 40. `set_camera` moves, re-aims or relenses it. A `model3d` clip in
`scene` camera mode picks a camera by `sceneCameraName`. Name cameras without
spaces or punctuation, such as `cam_wide`, because the renderer's loader
rewrites those characters and the name would no longer match.

```json
{"ops": [
  {"op": "add_object", "kind": "plane", "name": "floor"},
  {"op": "set_transform", "target": "floor", "scale": [6, 6, 1]},
  {"op": "add_object", "kind": "figure", "name": "ana", "body": "female",
   "pose": "walk", "position": [-1, 0, 0], "entityId": "<entity id>", "label": "Ana"},
  {"op": "add_object", "kind": "camera", "name": "cam_wide",
   "position": [0, 1.5, 6], "lookAt": [0, 1, 0], "fovDeg": 35},
  {"op": "add_object", "kind": "directionalLight"}
]}
```

In the open editor the same verbs are `ui_3d_add_object` with the same fields,
`ui_3d_set_figure` and `ui_3d_set_camera`.

## No viewport headlessly

`ui_3d_frame_scene` and `ui_3d_capture_view` need a WebGL context. Without one,
`get_model3d`'s world-space bounds are what answer "how big is this and where is
it". Use `render_model3d` when an actual picture is required.

## What `validate_model3d` catches

The glTF version, references that resolve to nothing (node, mesh, accessor,
material, buffer, skin, camera, skin joint, animation target and sampler), a
node with two parents, a cycle in the node hierarchy, a node carrying both a
matrix and TRS fields, an accessor with an unknown type or reading past its
buffer view, a buffer view reading past its buffer, an undeclared light, and an
extension this build cannot honor. It warns on an empty scene, geometry with no
light, and duplicate names. It only reads the document, and it handles
hierarchies of any depth.

## On a timeline

A `model3d` layer is the one kind `preview_timeline_frame` cannot draw on its
own canvas. The preview pass collects every 3D layer across the requested
instants, groups them by glTF plus the options that fix a renderer, and hands
each group to one headless Chromium page. Two fields on the layer's report say
what the pixels do not: `camera` (the pose it was drawn with, authored camera
folded with the animated channels) and `animation_time_sec` (the glTF
animation's own clock, not timeline time). With no Chrome on the host the group
is left out and reported as a `model3d_unavailable` degradation.

## Reference

In a NodeTool checkout, these repository sources go further:

- `docs/harnesses.md` § 3D scene tools
- `docs/harnesses.md` § 3D clips in preview_timeline_frame

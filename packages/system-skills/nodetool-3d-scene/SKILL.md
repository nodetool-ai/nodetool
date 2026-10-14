---
name: nodetool-3d-scene
description: "Build, edit, validate or render a NodeTool 3D model: glTF primitives, transforms, lights, material colors, generated meshes, and headless Blender renders. For a playable 3D game, use native-game."
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
   bounds. Call this before editing, for the uuids.
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
| `add_object` | `kind`: `box`, `sphere`, `plane`, `cylinder`, `torus`, `directionalLight`, `pointLight`. Optional `name` |
| `delete_object` | `target` |
| `set_transform` | `position`, `rotation` (Euler **degrees**), `scale`, each `[x, y, z]` |
| `set_visibility` | `visible` |
| `rename_object` | `target`, `name` |
| `set_material_color` | `color` as a CSS hex string, meshes only |
| `select_object` | `target`, or `null` to clear |

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

## No camera headlessly

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

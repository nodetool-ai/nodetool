---
name: nodetool-3d-scene
description: "Build, edit, validate or render a NodeTool 3D model: glTF objects, transforms, lights, materials, and headless Blender renders."
---

# Work a NodeTool 3D model

A 3D model is a `.glb` or `.gltf` **asset**, addressed by its asset id. The
capabilities edit the stored glTF in place and save it back over the same asset,
so the id stays valid and an open editor reloads it.

For a 2D game built from a Godot template and generated art, use
[godot-game](../godot-game/SKILL.md). For a 3D clip inside a cut, build the model
here and place it on a timeline.

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
5. **Render**, when a picture is asked for. `render_model3d` goes through
   headless Blender (EEVEE or Cycles), honors scene cameras and lights, and
   stores a PNG asset. It needs Blender on the server.

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

These are the `ui_3d_*` verbs with no editor open. The operations, the units and
the addressing live in `@nodetool-ai/model3d`, shared with the browser editor, so
a model built headlessly opens there unchanged.

## No camera headlessly

`ui_3d_frame_scene` and `ui_3d_capture_view` need a WebGL context. Without one,
`get_model3d`'s world-space bounds are what answer "how big is this and where is
it". Use `render_model3d` when an actual picture is required.

## What `validate_model3d` catches

The glTF version, references that resolve to nothing (node, mesh, accessor,
material, buffer), a cycle in the node hierarchy, a node carrying both a matrix
and TRS fields, a buffer view reading past its buffer, an undeclared light, and
an extension this build cannot honor. It warns on an empty scene, geometry with
no light, and duplicate names.

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

- [docs/harnesses.md § 3D scene tools](../../../docs/harnesses.md#3d-scene-tools-no-editor-no-browser)
- [docs/harnesses.md § 3D clips in preview_timeline_frame](../../../docs/harnesses.md#3d-clips-in-preview_timeline_frame)

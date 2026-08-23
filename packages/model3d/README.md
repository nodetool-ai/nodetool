# @nodetool-ai/model3d

The 3D scene document: glTF 2.0 reading and writing, primitive geometry, the
scene operations the editor exposes, and the static check behind
`validate_model3d`.

One implementation serves both 3D surfaces. The browser's `ui_3d_*` tools drive
a live three.js scene; the `model3d` agent capability runs the same verbs
against the glTF file itself, so an agent can build and edit a model with no
editor open and what it saves opens in the editor unchanged.

```ts
import {
  applyOperations,
  createModel3DFile,
  listScene,
  serializeModel3D,
  validateModel3D
} from "@nodetool-ai/model3d";

const file = createModel3DFile("Studio");
applyOperations(file, [
  { op: "add_object", kind: "box" },
  { op: "set_material_color", target: "Box", color: "#ff8800" },
  { op: "add_object", kind: "directionalLight" }
]);

validateModel3D(file.json).ok; // true
listScene(file.json); // one Mesh + one DirectionalLight
serializeModel3D(file); // .gltf bytes, ready to store as an asset
```

## What it keeps

An operation touches the nodes it names and nothing else: an imported model
keeps its meshes, textures, skins, animations and extensions. Deleting a node
renumbers glTF's node array, so every reference to one — scene roots, children,
animation channel targets, skin joints — is remapped in the same pass.

Units follow the editor's Properties panel, not glTF's storage form: rotation
is Euler degrees in three.js's XYZ order, and a material's base color is a CSS
hex string, converted to and from the linear-space factor glTF stores.

Object ids live in `node.extras.nodetool_id`, minted on the first edit. Without
them a delete would make an id an agent already holds point at a different
object, since glTF addresses nodes by array index.

## What it does not do

No rendering. `ui_3d_capture_view` and `ui_3d_frame_scene` need a WebGL context
and a camera; the headless substitute is `sceneBounds`, which reports the
scene's world-space extent from each mesh's accessor bounds.

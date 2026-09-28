---
name: api-sketches
description: "Call nodetool.sketches from a code action: create a sketch (layered image document), read it, add, arrange and restyle layers, place images on layers, resize the canvas, validate it, and manage its versions. Load before the first call into nodetool.sketches."
---

# nodetool.sketches

A sketch is an image document: a canvas, a stack of layers, and the bindings
that say where the picture of a layer comes from. How to compose one is
`nodetool-sketch`. This is the call reference. One finished image with no
layers to keep is `nodetool.media.generateImage`, not a sketch.

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({query, limit})` | Lists sketches, newest first. | Rows with id, name and canvas size |
| `create(name, {width, height, background_color, project_id, id})` | Creates a blank canvas. The defaults are 1024×1024 on `#ffffff`. An existing `id` you own is returned instead of a copy. | `{image_document_id, …}` |
| `get(id)` | Reads the document: canvas, background, layers, bindings. Layer bitmaps stay opaque. | The document |
| `edit(id, ops)` | Applies layer ops in order and saves. An open editor picks the change up live. | The result of each op |
| `validate(idOrDocument)` | Checks the structure without a render. | `{ok, issues}` |
| `versions(id, {save_type, limit})`, `getVersion(id, n)` | Lists and reads whole-document snapshots. | Version rows, newest first |
| `snapshot(id, {name})` | Saves a manual version. | The version number |
| `restore(id, n)` | Rolls back. The state it replaces is snapshotted first. | The findings of the validation after the restore |
| `deleteVersion(id, n)` | Deletes one snapshot. This cannot be undone. | — |

## Ops

`target` is a layer id, its name, or `"active"`. Layer index 0 is the
**bottom** layer.

| Op | Arguments |
| :--- | :--- |
| `add_layer` | `name?`, `type?` (`"raster"` or `"mask"`), `index?`, `image?`, `x?`, `y?`, `width?`, `height?` |
| `remove_layer` | `target` |
| `rename_layer` | `target`, `name` |
| `set_layer_props` | `target`, `visible?`, `locked?`, `opacity?`, `blendMode?` |
| `set_layer_image` | `target`, `image`, `x?`, `y?`, `width?`, `height?` |
| `reorder_layer` | `target`, `index` |
| `duplicate_layer` | `target` |
| `select_layer` | `target` |
| `resize_canvas` | `width`, `height` |
| `set_setup` | `brief?`, `use_case?`, `variations?`, `stage?` — the state of the guided image flow. It renders nothing. |

- `image` is an asset id, an `asset://` locator, a `data:` URL or an http(s)
  URL. The layer points at it and the editor draws it at its natural size from
  the top-left of `{x, y, width, height}`, which defaults to the whole canvas.
  Pass the dimensions of the image when you know them.
- `use_case` is `product`, `portrait`, `key-art`, `social`, `logo`, `concept`
  or `texture`, and it also sets the canvas size.
- Pixels are never read or written here. Painting and generation happen in an
  open editor or a workflow run.

```js
const { image_document_id: id } = await nodetool.sketches.create("Poster",
  { width: 1080, height: 1350 });
await nodetool.sketches.edit(id, [
  { op: "add_layer", name: "Backdrop", image: bgUri },
  { op: "add_layer", name: "Product", image: productUri, x: 240, y: 300, width: 600, height: 600 },
  { op: "set_layer_props", target: "Product", blendMode: "normal", opacity: 1 }
]);
const check = await nodetool.sketches.validate(id);
```

---
name: nodetool-sketch
description: "Build or edit a NodeTool sketch (image document): layers, blend modes, placed images, generation briefs, version history."
featured: true
---

# Work a NodeTool sketch

A sketch is an **image document**: a canvas, a stack of layers, and the bindings
that say where a layer's picture comes from. It is the surface for composited
stills, masks, overlays and the guided image brief. One finished image with no
layers to keep is `generate_image`, not a sketch.

The document is layers and references. **Headless tools never read or write
pixels.** Painting happens in an open editor (the `ui_sketch_*` tools below),
generation happens in a workflow run or through the image tools. An image lands
on a layer by reference, so nothing inlines a bitmap.

## The loop

1. **Find it.** `list_sketches`, then `get_sketch`. New one:
   `create_sketch {name, width?, height?, background_color?, project_id?}` gives a
   blank canvas (1024×1024, `#ffffff` by default).
2. **Edit the stack.** `edit_sketch {image_document_id, ops: [...]}`. Operations
   run in order against the stored document and the result is saved. An open
   editor picks the change up live.
3. **Validate.** `validate_sketch {image_document_id}` or an inline `document`.
4. **Snapshot** before a destructive pass with `create_sketch_version`.

## `edit_sketch` ops

| Op | Does |
|---|---|
| `add_layer` | `{name?, type?: "raster"\|"mask", index?, image?, x?, y?, width?, height?}`. An `image` field makes this one op instead of two |
| `remove_layer`, `rename_layer`, `duplicate_layer`, `reorder_layer` | Stack management |
| `select_layer` | Sets the active layer |
| `set_layer_props` | `opacity`, `blendMode`, visibility, lock |
| `set_layer_image` | Points a layer at an asset id, an `asset://` locator, a `data:` URL or an http(s) URL |
| `resize_canvas` | Positive integer width and height |
| `set_setup` | The generation brief: `brief`, `use_case`, `variations` (1..8), `stage`. Renders nothing |

`target` is a layer id, a layer name, or `"active"`. Layer index 0 is the
bottom of the stack. `use_case` is one of `product`, `portrait`, `key-art`,
`social`, `logo`, `concept`, `texture`, and it also sets the canvas size.
`stage` is where the guided flow resumes: `idea`, `useCase`, `review`, `look`,
or `done` for the plain editor.

An asset id that resolves to nothing is refused rather than stored, because a
stored one shows up as an empty layer.

With the sketch open in a browser, the `ui_sketch_*` tools act on the live
canvas, and only they touch pixels: `ui_sketch_get_state`,
`ui_sketch_place_image`, `ui_sketch_stroke`, `ui_sketch_fill`,
`ui_sketch_gradient`, `ui_sketch_draw_shape`, `ui_sketch_adjust_layer`,
`ui_sketch_transform`, `ui_sketch_crop`, `ui_sketch_merge_down`,
`ui_sketch_flatten_visible`, `ui_sketch_get_layer_image`,
`ui_sketch_generate` and `ui_sketch_render_to_asset`.

## Vector layers

The editor imports self-contained SVG files as vector layers. Each layer keeps
its SVG source in the document. Use the vector inspector to edit SVG source,
download it, or rasterize the layer for painting. Moving and transforming a
vector layer preserves its source. Rasterization is undoable. Example sketches
open with vector layers.

SVG scripts, embedded HTML, animations, external images, and stylesheets are
removed on import. Use presentation attributes for fills, strokes, and text.
The headless stack operations can preserve existing vector layers. Creating or
editing SVG source currently requires the editor.

## The guided brief

`set_setup` writes the one-line brief. `refine_image_brief {image_document_id,
provider?, model?}` expands it into the five fields an image model needs
(subject, composition, lighting, style words, and what to leave out) and stops
at the review step. It creates no layer and starts no generation. It is the
cheap text pass a person edits before anything is rendered.

Once the fields read right, put pixels on a layer in two calls:
`generate_image` saves the result as an asset and returns its `asset://` URI,
then `edit_sketch` with `add_layer {image}` or `set_layer_image {target, image}`
places it. Generation spends provider money, so confirm the count with the user
before rendering several `variations`.

To use the finished composite in a workflow, `nodetool.sketch.RenderSketch`
takes a `sketch` and flattens it to an `image` and a `mask`.

## What `validate_sketch` catches

Duplicate layer ids, an active or mask layer the stack lacks, unknown blend
modes, opacities and transforms that cannot render, generation bindings pointing
at missing layers, unknown binding kinds and statuses, canvas settings that
disagree with the stored ones, and fields a schema round trip would strip. Layer
bitmaps stay opaque to it.

## Versions

`list_sketch_versions`, `get_sketch_version` (read a snapshot without restoring),
`create_sketch_version`, `restore_sketch_version`, `delete_sketch_version`.
A restore snapshots the pre-restore state first, so it is undoable, then
re-validates against today's schema: an old document may fail what it used to
pass.

These snapshot the whole document. The per-layer generation takes are a
different thing, and they record one generated image on one layer.

## Verify from a shell

These are the `nodetool` CLI. From a NodeTool checkout the same commands run
as `npm run dev:nodetool -- <command>`.

```bash
nodetool sketch validate <image_document_id|sketch.json> --json
nodetool sketch debug sketch.json \
  --interact '[{"tool":"add_layer","input":{"name":"Shadow"}},
               {"tool":"set_layer_props","input":{"target":"Shadow","opacity":0.4,"blendMode":"multiply"}}]'
nodetool sketch versions list <id> --save-type manual --limit 10
```

A path on disk wins over an id. `debug` runs the static check, then each
`--interact` step against the headless `ui_sketch_*` bridge, and validates what
the session left behind. A failing step is recorded and the script continues.
Pixels, painting, rendering, generation and asset I/O are not simulated.

## Where a sketch is used

- A mini app shows one with the **Sketch** widget, which takes a
  `{type: "sketch", id}` reference, and collects one with the **Sketch Pad**
  input. See `nodetool-app-builder`.
- A mini app resource of `kind: "sketch"` lets the app read or edit it.

## Reference

In a NodeTool checkout, these repository sources go further:

- `docs/harnesses.md` § nodetool sketch validate / debug
- `docs/harnesses.md` § nodetool sketch versions

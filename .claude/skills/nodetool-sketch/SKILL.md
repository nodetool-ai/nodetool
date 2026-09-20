---
name: nodetool-sketch
description: "Build or edit a NodeTool sketch (image document): layers, blend modes, placed images, generation briefs, version history."
---

# Work a NodeTool sketch

A sketch is an **image document**: a canvas, a stack of layers, and the bindings
that say where a layer's picture comes from. It is the surface for composited
stills, masks, overlays and the guided image brief. One finished image with no
layers to keep is `generate_image`, not a sketch.

The document is layers and references. **Pixels are never read or written
headlessly.** Painting happens in an open editor, generation happens in a
workflow run or through the image tools. An image lands on a layer by
reference, so nothing inlines a bitmap.

## The loop

1. **Find it.** `list_sketches`, then `get_sketch`. New one:
   `create_sketch {name, width?, height?, background?, project_id?}` gives a
   blank canvas (1024×1024, `#ffffff` by default).
2. **Edit the stack.** `edit_sketch {image_document_id, ops: [...]}`. Operations
   run in order against the stored document and the result is saved. An open
   editor picks the change up live.
3. **Validate.** `validate_sketch {image_document_id}` or an inline `document`.
4. **Snapshot** before a destructive pass with `create_sketch_version`.

## `edit_sketch` ops

| Op | Does |
|---|---|
| `add_layer` | Adds a layer. An `image` field makes this one op instead of two |
| `remove_layer`, `rename_layer`, `duplicate_layer`, `reorder_layer` | Stack management |
| `select_layer` | Sets the active layer |
| `set_layer_props` | `opacity`, `blendMode`, visibility, lock |
| `set_layer_image` | Points a layer at an asset id, an `asset://` locator, a `data:` URL or an http(s) URL |
| `resize_canvas` | Positive integer width and height |
| `set_setup` | The generation brief: `brief`, `use_case`, `variations` (1..8), `stage` |

An asset id that resolves to nothing is refused rather than stored, because a
stored one shows up as an empty layer.

With the sketch open in a browser, `ui_sketch_place_image` does the same against
the live canvas.

## The guided brief

`set_setup` writes the one-line brief. `refine_image_brief {image_document_id,
provider?, model?}` expands it into the five fields an image model needs
(subject, composition, lighting, style words, and what to leave out) and stops
at the review step. It creates no layer and starts no generation. It is the
cheap text pass a person edits before anything is rendered. Generate from it
with the image tools once the fields read right.

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

```bash
npm run dev:nodetool -- sketch validate <image_document_id|sketch.json> --json
npm run dev:nodetool -- sketch debug sketch.json \
  --interact '[{"tool":"add_layer","input":{"name":"Shadow"}},
               {"tool":"set_layer_props","input":{"target":"Shadow","opacity":0.4,"blendMode":"multiply"}}]'
npm run dev:nodetool -- sketch versions list <id> --save-type manual --limit 10
```

A path on disk wins over an id. `debug` runs the static check, then each
`--interact` step against the headless `ui_sketch_*` bridge, and validates what
the session left behind. A failing step is recorded and the script continues.
Pixels, painting, rendering, generation and asset I/O are not simulated.

## Where a sketch is used

- A mini app shows one with the **Sketch** widget, which takes a
  `{type: "sketch", id}` reference, and collects one with the **Sketch Pad**
  input. See [nodetool-app-builder](../nodetool-app-builder/SKILL.md).
- A mini app resource of `kind: "sketch"` lets the app read or edit it.

## Reference

- [docs/harnesses.md § nodetool sketch validate / debug](../../../docs/harnesses.md#nodetool-sketch-validate--debug-sketch-harness)
- [docs/harnesses.md § nodetool sketch versions](../../../docs/harnesses.md#nodetool-sketch-versions-sketch-version-history)

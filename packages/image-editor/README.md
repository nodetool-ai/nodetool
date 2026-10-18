# @nodetool-ai/image-editor

Shared image-editor types, dependency hashing, seeded layer templates, and the paint core for [NodeTool](https://nodetool.ai).

The pure layer behind NodeTool's layered sketch editor: the persisted document shape, per-layer generation bindings (workflow-bound and direct text-to-image / image-to-image / inpaint), version history, the content hash that detects when a layer is stale, and the brush/pencil/eraser stroke engine. Kept free of the web editor implementation so both the browser and server can depend on it.

## Install

```bash
npm install @nodetool-ai/image-editor
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `ImageDocument` | interface | Top-level persisted image document (sketch + layer bindings) |
| `SketchDocumentLike` | interface | Minimal sketch-compatible document payload |
| `SketchLayerLike` | interface | One layer (raster / mask / group) |
| `SketchViewportLike` | interface | Zoom + pan state |
| `LayerWorkflowBinding` | interface | How a layer's pixels are generated (unified binding) |
| `LayerBinding` | type | Clearer alias of `LayerWorkflowBinding` for new code |
| `LayerBindingKind` | type | `"workflow" \| "text-to-image" \| "image-to-image" \| "inpaint"` |
| `LayerStatus` | type | `draft`, `queued`, `generating`, `generated`, `stale`, `failed`, … |
| `LayerVersion` | interface | One recorded generation of a layer |
| `PersistedHistoryEntryLike` | interface | Undo/redo history entry shape |
| `LayerTemplateKind` | type | `"text-to-image" \| "inpaint" \| "background-remove"` |
| `LayerTemplateDefinition` | interface | Seeded workflow template for a new layer |

The Node-only `computeDependencyHash` (and its `DependencyHashInput`) is not re-exported from the root because it pulls in `node:crypto`. Import it from the subpath on the server:

```ts
import { computeDependencyHash } from "@nodetool-ai/image-editor/dependencyHash";
```

## Paint core

`@nodetool-ai/image-editor/painting.js` is the brush/pencil/eraser stroke
engine — pressure dynamics, dab spacing, brush-stamp caching, supersampling,
dirty-rect tracking — plus the settings shapes it reads (`BrushSettings`,
`PencilSettings`, `EraserSettings`, `DEFAULT_BRUSH_SETTINGS`, …). The web
sketch editor re-exports it; there is no second copy.

It is plain Canvas2D with one seam. The engine allocates the off-screen bitmaps
for its stamp cache through `createPaintSurface`, which defaults to
`window.document.createElement("canvas")`. A headless host swaps that out:

```ts
import { createCanvas } from "@napi-rs/canvas";
import {
  setPaintSurfaceFactory,
  drawBrushStroke,
  DEFAULT_BRUSH_SETTINGS
} from "@nodetool-ai/image-editor/painting.js";

setPaintSurfaceFactory(createCanvas);

const canvas = createCanvas(256, 256);
drawBrushStroke(
  { x: 32, y: 48 },
  { x: 224, y: 176 },
  { ...DEFAULT_BRUSH_SETTINGS, size: 24, color: "#ff2d55" },
  canvas.getContext("2d"),
  undefined,
  { current: null },
  new Map()
);
```

`setPaintSurfaceFactory(null)` restores the browser default. `PaintContext2D`
and `PaintSurface` are structural types, so a DOM `CanvasRenderingContext2D`
and a skia canvas both satisfy them without a cast.

## Raster ops

`@nodetool-ai/image-editor/raster.js` is the fill, gradient, shape, transform,
adjust, crop, and selection-mask engine the `ui_sketch_*` tools share. ImageData
ops (`fillRegion`, `adjustImage`, `pickPixel`, selection builders) need no
canvas. Drawing ops (`drawGradient`, `drawShape`, `transformRaster`, `cropRaster`)
take a `RasterContext2D` — a DOM or skia 2D context.

## Compositing

`@nodetool-ai/image-editor/render.js` holds the rules that turn a sketch
document into pixels: load-time normalization of transforms and effects
(`normalizeLayerTransform`, `normalizeLayerEffects`), visibility through groups
and group opacity, where a layer raster lands, affine and quad transforms, and
the CSS filter chain behind layer effects. The web editor's Canvas2D runtime
composites through these functions.

`renderSketchDocument(document, host, options)` composites a whole persisted
document in one pass, as the editor's PNG export does. The host supplies
surfaces, image decoding and the blend table, so the module needs no canvas
library and no storage access:

```ts
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { blendModeToCanvasOp } from "@nodetool-ai/gpu";
import { renderSketchDocument } from "@nodetool-ai/image-editor/render.js";

const result = await renderSketchDocument(imageDocument, {
  createSurface: (w, h) => createCanvas(w, h),
  loadImage: (source) => loadImage(decodeDataUrl(source)),
  compositeOperation: blendModeToCanvasOp,
  supportsFilter: true
}, { width: 512 });
```

`options.layerId` renders one layer without its opacity or blend mode, and
each entry of `result.layers` reports whether that layer was drawn.
`@nodetool-ai/agents/sketch-render` is the complete Node host behind
`nodetool sketch render` and the `render_sketch` tool.

## PSD

`@nodetool-ai/image-editor/psd.js` writes layered Photoshop files: `encodePsd`
for a layer tree, and `encodeSketchPsd` for a sketch, given each layer's pixels
at document size and the flattened composite. The editor's Export PSD and the
headless renderer both use it.

## Usage

```ts
import type { ImageDocument, LayerBinding } from "@nodetool-ai/image-editor";

const doc: ImageDocument = loadDocument(id);
const binding: LayerBinding | undefined = doc.layerBindings.find(
  (b) => b.layerId === activeLayerId
);

if (binding?.status === "stale") {
  regenerate(binding);
}
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

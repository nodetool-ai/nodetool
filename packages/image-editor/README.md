# @nodetool-ai/image-editor

Shared image-editor types, dependency hashing, and seeded layer templates for [NodeTool](https://nodetool.ai).

The pure type layer behind NodeTool's layered sketch editor: the persisted document shape, per-layer generation bindings (workflow-bound and direct text-to-image / image-to-image / inpaint), version history, and the content hash that detects when a layer is stale. Kept free of the web editor implementation so both the browser and server can depend on it.

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

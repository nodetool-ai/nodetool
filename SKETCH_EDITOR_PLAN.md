# Sketch Editor Implementation Plan

## Phase 1: Foundation + Usable MVP

### Editor Shell
- [x] SketchEditor main component composing canvas, toolbar, layers panel
- [x] SketchModal fullscreen/modal wrapper with header (title, save, close)
- [x] Portal rendering for proper z-index stacking
- [x] Keyboard shortcut support (Escape to close)

### Raster Painting Basics
- [x] Brush tool with stroke rendering
- [x] Eraser tool (destination-out composite)
- [x] Pointer events (pen/mouse/touch drawing)
- [x] Eyedropper / color picker tool

### Brush Size/Opacity/Color
- [x] Brush: size, opacity, hardness, color
- [x] Eraser: size, opacity
- [x] Real-time slider controls in toolbar
- [x] Color picker input

### Undo/Redo
- [x] History snapshot system (max 30 entries)
- [x] Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts
- [x] Undo/Redo toolbar buttons with enable/disable state
- [x] History truncation when editing after undo

### Layers Panel
- [x] Add / delete layers (minimum 1 enforced)
- [x] Layer visibility toggle
- [x] Reorder layers (up/down)
- [x] Duplicate layers
- [x] Rename layers (double-click)
- [x] Per-layer opacity slider
- [x] Per-layer blend modes (normal, multiply, screen, overlay, darken, lighten)

### Optional Input Image Loading
- [x] `loadImageToLayerData()` function in serialization
- [x] Aspect-ratio preserving image scaling
- [x] **Connect input_image handle to load image into base layer**
- [x] Auto-resize canvas to match input image dimensions (deferred to Phase 2)

### Mask Layer Designation and Export
- [x] Designate any layer as mask via UI button
- [x] Stored in document as `maskLayerId`
- [x] Visual indication in layers panel
- [x] `exportMask()` function

### Autosave + Reload from Serialized Sketch Document
- [x] `serializeDocument()` — JSON stringify
- [x] `deserializeDocument()` — JSON parse with validation
- [x] `onDocumentChange` callback for autosave
- [x] Version field (v1) for future migrations
- [x] Metadata tracking (createdAt, updatedAt)

### Flattened Image Export
- [x] `flattenDocument()` — composite visible non-mask layers
- [x] `flattenToDataUrl()` — canvas ref method
- [x] `canvasToDataUrl()` / `canvasToBlob()` — PNG export
- [x] Respects layer visibility, opacity, blend modes

### Dedicated Sketch Node
- [x] Custom ReactFlow node component (`SketchNode.tsx`)
- [x] Input handle: `input_image` (optional)
- [x] Output handles: `image` and `mask`
- [x] Preview thumbnail generation
- [x] Edit button opens modal
- [x] Serialized state persisted in `sketch_data` property
- [x] Resizable node container
- [x] **Output image/mask data as ImageRef properties for downstream nodes**
- [x] **Process incoming `input_image` from upstream nodes and load into editor**
- [x] **Real-time export callbacks during live editing**

### Frontend Property Widget
- [x] `SketchProperty` component with preview thumbnail
- [x] "Open Editor" / "Click to edit" UI
- [x] Modal opens on click
- [x] Real-time serialization updates

### Property Type Wiring
- [x] `PropertyInput.tsx` — `case "sketch"` → `SketchProperty`

### Node Registration
- [x] `ReactFlowWrapper.tsx` imports and registers `SketchNode`

### Unit Tests
- [x] Type tests (defaults, helpers, isShapeTool, swatches)
- [x] Serialization tests (serialize/deserialize round-trip)
- [x] Store tests (CRUD, undo/redo, tool settings, blend modes)
- [x] 68 tests passing

---

## Phase 2: Strong Parity for Common Workflows

### Multiple Brush Types
- [x] Brush with size/opacity/hardness/color
- [x] Eraser with size/opacity
- [x] Pencil (hard edge, 1px aliased)
- [ ] Airbrush / soft brush
- [ ] Custom brush shapes/textures

### Selection Tools
- [ ] Rectangular selection
- [ ] Elliptical selection
- [ ] Free-form / lasso selection
- [ ] Selection actions (cut, copy, paste, delete, invert)

### Move/Transform
- [ ] Move layer content
- [ ] Scale / resize
- [ ] Rotate
- [ ] Flip horizontal / vertical

### Crop
- [ ] Crop tool
- [ ] Canvas resize dialog

### Fill/Gradient
- [x] Flood fill tool with color tolerance
- [ ] Gradient fill tool (linear, radial)
- [ ] Pattern fill

### Shape Tools
- [x] Line tool
- [x] Rectangle tool
- [x] Ellipse tool
- [x] Arrow tool
- [x] Live preview overlay during draw
- [x] Stroke color/width, fill color, filled toggle
- [ ] Rounded rectangle
- [ ] Polygon tool

### Keyboard Shortcuts
- [x] Tool selection (B, E, I, G, L, R, O, A)
- [x] Undo/Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- [x] Mirror toggle (M)
- [x] Brush size ([ / ])
- [x] Zoom (+ / -)
- [x] Canvas fit (Ctrl+0)

### Mirror Drawing
- [x] Horizontal mirror mode toggle
- [x] Mirror indicator in toolbar
- [x] Vertical mirror mode
- [ ] Both axes mirror

### Palettes/Swatches
- [x] 28-color default swatch palette
- [x] Swatch grid in toolbar
- [ ] Custom palette save/load
- [ ] Recent colors

### Layer Opacity and Blend Modes
- [x] Per-layer opacity slider (0–1)
- [x] Blend modes: normal, multiply, screen, overlay, darken, lighten
- [x] Additional blend modes (color-dodge, color-burn, hard-light, soft-light, difference, exclusion)

### Group/Folder Layers
- [ ] Layer groups/folders
- [ ] Group visibility toggle
- [ ] Nested layer hierarchy

### Better Project Persistence
- [x] JSON serialization with base64 layer data
- [ ] Compression for large documents
- [ ] Size warnings for large documents
- [ ] Export/import project files

### Cleaner Node UI/Preview
- [x] Preview thumbnail updates on document change
- [x] Brush/eraser size cursor preview (zoom-aware)
- [x] Keyboard shortcut hints in toolbar
- [ ] Canvas size indicator in node
- [ ] Input/output status indicators

### Import/Export Paths
- [x] PNG export (flattened image)
- [x] PNG mask export
- [ ] Save to file / download
- [ ] Load from file / upload
- [ ] PSD export (stretch goal)

---

## Phase 3: SAM Segmentation

Goal: make local SAM3 layer splitting the first complete sketch-to-NodeTool image-editing flow. Sketch owns UI, source preparation, preview, and document-space apply. NodeTool nodes own execution, model loading, assets, job updates, and cancellation.

Known local node shape: `huggingface.image_segmentation.MaskGeneration` with model `facebook/sam3`, input `image`, optional `points_per_side` and `pred_iou_thresh`, and output `list[ImageRef]` masks. It supports automatic mask generation for splitting a selected layer. It does not currently expose text/concept prompts, point prompts, box prompts, labels, confidence, or RLE output through this node.

Known provider node shape: fal has SAM3 image nodes with `image`, `prompt`, `point_prompts`, `box_prompts`, `return_multiple_masks`, `max_masks`, `include_scores`, and `include_boxes`. `Sam3Image` returns `masks`, optional preview `image`, `metadata`, `scores`, and `boxes`; `Sam3ImageRle` returns `rle`, optional `metadata`, `scores`, and `boxes`. Use this as a reference for sketch-needed local SAM3 inputs, not as a 100% parity target. Current generated NodeTool entries use `fal-ai/sam-3/image` and `fal-ai/sam-3/image-rle`; verify or update them to `fal-ai/sam-3-1/image` and `fal-ai/sam-3-1/image-rle` before relying on provider SAM3.

Guardrail: treat `web/src/components/sketch/sam/` as prototype code to evaluate, not fixed architecture. Keep only the parts that translate sketch document concepts to NodeTool node graphs and back. Prefer local SAM3. Add local node inputs only when the sketch editor needs them for layer split or prompted object separation; do not chase full provider parity.

### [x] 3.1 Define Local SAM3 Backend

Files:
- `web/src/components/sketch/sam/SamServiceNode.ts`
- `web/src/components/sketch/sam/SamService.ts`
- `web/src/components/sketch/types/tools.ts`
- `web/src/stores/MetadataStore.ts`
- `web/src/stores/ModelDownloadStore.ts`
- `nodetool-huggingface/src/nodetool/nodes/huggingface/image_segmentation.py`

Steps:
- [x] Add one backend id for Local SAM3.
- [x] Map Local SAM3 to `huggingface.image_segmentation.MaskGeneration`.
- [x] Set the node `model` input to `facebook/sam3`.
- [x] Expose `points_per_side` and `pred_iou_thresh` as advanced settings.
- [x] Mark Local SAM3 capabilities as automatic split and mask image output.
- [x] Mark text prompts, point prompts, box prompts, labels, confidence, and RLE as unsupported unless node metadata exposes them.
- [x] Read node type availability from `MetadataStore`; do not trust static config alone.
- [x] Read node input metadata to confirm `image`, `model`, `points_per_side`, and `pred_iou_thresh`.
- [x] Read local model state for `facebook/sam3` when NodeTool exposes it.
- [x] Show "Local SAM3 is not ready" when model state is missing, downloading, loading, failed, or unavailable.
- [x] Persist the selected backend in segment tool settings.

Check:
- [x] User sees Local SAM3, not the raw node name.
- [x] Missing node and local-not-ready states are shown as hints.
- [x] UI shows only automatic layer split for the current local node.
- [x] Backend selection survives closing and reopening the sketch editor.

### [x] 3.2 Run SAM Through NodeTool Jobs

Files:
- `web/src/components/sketch/sam/NodeExecutor.ts`
- `web/src/components/sketch/sam/SamServiceNode.ts`
- `web/src/components/node_test/useNodeTestRunner.ts`
- `web/src/lib/websocket/GlobalWebSocketManager.ts`
- `web/src/stores/WorkflowRunner.ts`

Steps:
- [x] Use NodeTool's existing single-node WebSocket job pattern from `useNodeTestRunner`.
- [x] Factor a shared single-node/inline-graph helper if SAM and node tests need the same code.
- [x] Keep `NodeExecutor` only as a thin adapter if a shared helper does not fit.
- [x] Build a one-node graph for `huggingface.image_segmentation.MaskGeneration`.
- [x] Send `image`, `model: facebook/sam3`, `points_per_side`, and `pred_iou_thresh` as node inputs.
- [x] Send the graph through the existing `globalWebSocketManager` connection.
- [x] Use the same `run_job` fields as the existing single-node runner, including `job_id`, synthetic `workflow_id`, auth fields, `api_url`, `execution_strategy`, `params`, and `graph`.
- [x] Subscribe by `job_id`.
- [x] Collect `node_update.result` and `output_update.value`.
- [x] Finish on terminal `job_update`.
- [x] On abort, update sketch UI and send backend `cancel_job`.
- [x] Clean up subscription, timeout, and abort listener.

Check:
- [x] SAM does not create a sketch-specific WebSocket.
- [x] SAM does not duplicate a full workflow runner.
- [x] SAM reuses or shares the existing single-node execution path.
- [x] Cancelling a slow local run cancels the backend job.
- [x] Tests cover Local SAM3 run message shape, output collection, success, failure, abort, timeout, and cleanup.

### [x] 3.3 Implement Split Selected Layer

Files:
- `web/src/components/sketch/tools/SegmentTool.ts`
- `web/src/components/sketch/sam/SamServiceNode.ts`
- `web/src/components/sketch/serialization/index.ts`
- `web/src/components/sketch/types/document.ts`
- `web/src/components/sketch/types/tools.ts`

Steps:
- [x] Add a "Split selected layer" action.
- [x] Require exactly one active/selected raster layer.
- [x] Enable this action when Local SAM3 is available.
- [x] Export the full layer content, including off-canvas pixels.
- [x] Preserve source layer id, layer transform, content bounds, canvas size, and document-space origin.
- [x] Build the Local SAM3 graph input from that source.
- [x] Use inline image data only for small sources.
- [x] Use existing image/asset references for large sources.
- [x] Keep the original layer unchanged.

Check:
- [x] One selected layer can be split into new layers with one action.
- [x] Unavailable Local SAM3 shows a clear hint instead of a broken action.
- [x] Off-canvas source pixels are included.
- [x] Original layer is still present and editable.

### [x] 3.4 Normalize Local SAM3 Mask Outputs

Files:
- `web/src/components/sketch/sam/SamServiceNode.ts`
- `web/src/components/sketch/sam/`
- `web/src/components/sketch/types/tools.ts`

Steps:
- [x] Move output parsing out of graph execution.
- [x] Accept the Local SAM3 node output as a list of `ImageRef` masks.
- [x] Normalize each mask to a sketch result with kind `mask`.
- [x] Preserve mask dimensions, backend id, model id, node type, and source metadata.
- [x] Use stable generated names when the node returns masks without labels.
- [x] Return a clear empty result when no masks are returned.

Check:
- [x] SAM output parsing is independent from WebSocket execution.
- [x] SAM output parsing is independent from document layer mutation.
- [x] Tests cover Local SAM3 list output, empty output, malformed output, partial output, and ordering.

### [x] 3.5 Apply Accepted Results In Document Space

Files:
- `web/src/components/sketch/types/document.ts`
- `web/src/components/sketch/serialization/index.ts`
- `web/src/components/sketch/state/`
- `web/src/components/sketch/rendering/`

Steps:
- [x] Preview normalized masks without changing the document.
- [x] Apply accepted masks as one new group.
- [x] Create ordinary raster layers only.
- [x] Place generated layers in document space using source metadata.
- [x] Store provenance in `Layer.segmentationMeta`.
- [x] Create one history step for one apply action.
- [x] Keep generated layers compatible with paint, move, transform, trim, export, and serialization.
- [x] Do not add SAM-specific rendering code.

Check:
- [x] Generated layers align with transformed, cropped, and off-canvas source layers.
- [x] Generated layers are normal editable sketch layers.
- [x] Serialization and export/readback preserve generated layers.

### [ ] 3.6 Add Sketch-Needed Local SAM3 Prompts

Files:
- `nodetool-huggingface/src/nodetool/nodes/huggingface/image_segmentation.py`
- `web/src/components/sketch/tools/SegmentTool.ts`
- `web/src/components/sketch/sam/SamServiceNode.ts`
- `web/src/components/sketch/types/tools.ts`

Steps:
- [ ] Keep prompt UI out of the first local-only implementation.
- [ ] Decide which prompt inputs are required for sketch object separation: concept text, point prompts, box prompts.
- [ ] Verify whether the installed local SAM3 runtime supports those inputs.
- [ ] Add only the supported sketch-needed prompt fields to the local node.
- [ ] Add multi-mask controls only if sketch needs more than one mask from a prompted run.
- [ ] Return labels, scores, and boxes only if the runtime returns them and sketch uses them for preview or naming.
- [ ] Do not add provider-only fields such as hosted URL controls, sync mode, output format, or RLE unless sketch needs them.
- [ ] Gate sketch UI prompt modes strictly from node metadata.
- [ ] Keep prompt UI hidden until the local node exposes matching inputs.

Check:
- [ ] The sketch editor does not send prompt inputs that the node does not declare.
- [ ] Point, box, and concept UI appear only when the local node supports them.
- [ ] Local SAM3 remains focused on sketch layer split and object separation.
- [ ] Tests cover capability detection from node metadata.

### [ ] 3.7 Add Paid SAM3 Backend Later If Local Is Not Enough

Files:
- `web/src/components/sketch/sam/SamServiceNode.ts`
- `web/src/components/sketch/types/tools.ts`
- `web/src/stores/MetadataStore.ts`
- `web/src/stores/SecretsStore.ts`
- `packages/fal-codegen/src/configs/image-to-image.ts`
- `packages/fal-nodes/src/fal-manifest.json`

Steps:
- [ ] Add this task only after Local SAM3 split works end to end.
- [ ] Add this task only if local SAM3 cannot cover the sketch interaction needed.
- [ ] Verify whether NodeTool should use `fal-ai/sam-3/image` or the newer `fal-ai/sam-3-1/image`.
- [ ] Verify whether NodeTool should use `fal-ai/sam-3/image-rle` or the newer `fal-ai/sam-3-1/image-rle`.
- [ ] Update fal codegen config and generated manifest if `sam-3-1` should replace or sit beside `sam-3`.
- [ ] Map Provider SAM3 image output to `fal.image_to_image.Sam3Image` when that node type exists.
- [ ] Map Provider SAM3 RLE output to `fal.image_to_image.Sam3ImageRle` when that node type exists.
- [ ] Read paid provider secret state from existing secrets state.
- [ ] Use `prompt` for concept segmentation when node metadata exposes it.
- [ ] Use `point_prompts` and `box_prompts` only when node metadata exposes them.
- [ ] Request `return_multiple_masks`, `include_scores`, and `include_boxes` when the UI needs multiple outputs and metadata.
- [ ] Add provider output normalization for `masks`, preview `image`, `rle`, `metadata`, `scores`, and `boxes`.
- [ ] Keep Provider SAM3 behind the same capability metadata checks as Local SAM3.

Check:
- [ ] Provider SAM3 does not affect the Local SAM3 path.
- [ ] Missing provider setup is shown as a hint, not an error.
- [ ] Concept, point, and box prompt UI can be enabled by provider metadata without hardcoding UI assumptions.
- [ ] Provider SAM3 outputs still apply as ordinary document-space layers.

### [ ] 3.8 Validate The Local SAM3 Workflow Manually

Steps:
- [ ] Run Local SAM3 with `facebook/sam3`.
- [ ] Split a normal in-canvas layer.
- [ ] Split a moved or partially off-canvas layer.
- [ ] Adjust `points_per_side` and confirm mask count changes.
- [ ] Adjust `pred_iou_thresh` and confirm low-confidence masks are filtered.
- [ ] Cancel a slow local run.
- [ ] Check missing local model state.
- [ ] Check large source transport uses image references.
- [ ] If prompt support was added to the node, validate points, boxes, and concept prompts.

Check:
- [ ] A normal user can complete the SAM workflow without knowing NodeTool internals.
- [ ] Failure states explain what to fix next.
- [ ] Results line up in document space and remain editable.

---

## Phase 4: Advanced Parity / Extensibility

- [ ] Vector / pen / text layers
- [ ] SVG import/export
- [ ] Advanced brush system (custom brushes, textures, dynamics)
- [ ] Multiple canvases / documents
- [ ] PSD/ORA compatibility
- [ ] User-selected NodeTool workflows for sketch image-to-image edits
- [ ] 3D layer support (if feasible)
- [ ] Plugin / extension system

---

## Current Status Summary

| Category | Status |
|----------|--------|
| **Phase 1 Core** | 100% complete |
| **Phase 2** | ~65% complete (shapes, fill, pencil, swatches, 12 blend modes, H+V mirror, canvas auto-resize, cursor preview, shortcuts) |
| **Phase 3** | Planned: SAM segmentation through existing NodeTool execution/model/asset contracts |
| **Tests** | 79 passing |
| **Type Safety** | Clean (no sketch-related type errors) |
| **Base Branch** | `feat/ts-backend-migration` |

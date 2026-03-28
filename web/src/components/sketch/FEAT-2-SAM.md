# FEAT 2: SAM-Based Object Separation

## Goal

Add a practical segmentation workflow to the sketch editor that can detect or isolate objects, preview the result, and create one or more new layers grouped together without breaking normal editing, history, or export flows.

## Product Shape

- user can run segmentation on the active layer, a reference/image-backed layer, or an imported image
- result can become one mask, one cutout, or multiple separated object layers inside a new layer group
- workflow should work even when the required model is not installed yet
- advanced prompting should be possible, but the first version should stay simple and predictable
- assume `SAM 2` as the main baseline; treat `SAM 2.1` as the preferred improved checkpoint path when available

## Key Constraint

SAM itself is mainly a segmentation model, not a text-to-object model. If we want prompts like "extract all chairs" or "separate person and dog", that likely needs a text-guided detector or grounding model in front of SAM. Treat that as an explicit pipeline choice, not as implicit SAM behavior.

## Task List

### 1. Model availability and installation

- [x] decide the supported inference path for v1: local desktop model, backend service, browser/WASM, or a hybrid fallback
  > v1 supports two backends: **fal.ai cloud** (default, for fast testing) and **nodetool node execution** (WebSocket-based, supports fal-sam2 and hf-sam2 node configs). Backend is selectable in the segment tool settings panel.
- [x] define the default model target for v1: prefer `SAM 2`, decide whether `SAM 2.1` checkpoints are the baseline, and only fall back to smaller/mobile variants when that is necessary
  > Default target is `facebook/sam2-hiera-large` via fal-ai/sam2/image endpoint. HuggingFace local SAM 2 is available as a secondary backend.
- [x] add model discovery so the editor can detect whether the required segmentation model is already available
  > `checkModelAvailability()` on both SamServiceFal and SamServiceNode checks API key config and endpoint health.
- [x] show clear UI state for model availability: installed, missing, downloading, ready, failed
  > SegmentSettingsPanel now shows model status: available (✓), not-installed (warning + message), error, checking, downloading with progress.
- [ ] add a download/install action when the model is missing
- [ ] show model size, estimated download time, and storage location before install when possible
- [ ] support cancel/retry for model download and initialization
- [ ] persist installed-model status so the editor does not re-check expensively on every open

### 2. User entry points and workflow

- [x] add a clear entry point in the editor UI for segmentation or "separate objects"
  > Segment tool with dedicated toolbar button, SegmentSettingsPanel in top bar and context menu.
- [x] support running segmentation from the active layer only first, then extend to selected layers or whole document if needed
  > Segmentation runs on the active layer's image data.
- [x] define whether segmentation runs on visible composited pixels or on one source layer at a time
  > Runs on one source layer at a time (active layer).
- [x] support preview-before-apply so users can inspect the segmentation result before creating layers
  > "previewing" status with mask overlay and Apply/Discard buttons.
- [x] support cancel while inference is running
  > AbortController-based cancellation with Cancel button in UI.
- [x] make the action history-safe so one segmentation apply becomes one clean undo step
  > pushHistory("Segment Objects") before structural changes with structure-only restore mode.

### 3. Prompting and separation settings

- [x] define the first prompting modes:
- [x] point prompts: positive and negative clicks
- [x] box prompt from selection bounds
- [ ] automatic "separate prominent objects"
- [x] add separation settings for practical control:
- [x] maximum number of objects to return
- [x] minimum object size / ignore tiny fragments
- [x] mask confidence threshold
- [ ] overlap or duplicate suppression threshold
- [x] whether to return masks, cutouts, or both
- [ ] whether to crop each output to bounds or preserve document-space placement
- [x] whether to keep the source layer unchanged, hide it, lock it, or convert it to a reference layer

### 4. Layer output model

- [x] create separated results as a new layer group by default
- [x] create one child layer per separated object with stable naming such as `Object 1`, `Object 2`, or detector-derived labels when available
- [x] preserve document-space placement so separated layers line up exactly with the source image
- [x] store source metadata for each generated layer: source layer ID, segmentation run ID, model used, and mask/cutout origin
- [x] decide whether generated layers are plain raster layers, masked layers, or reference/image-backed layers
- [ ] support creating a companion mask layer or alpha mask when useful
- [ ] support group-level operations after creation: rename group, hide/show all, merge down, export each child

### 5. Editing behavior after separation

- [x] ensure separated layers paint, move, transform, trim, export, and serialize like normal layers
- [ ] ensure off-canvas pixels and transformed-layer behavior still work for separated results
- [ ] support quick follow-up commands such as "select object layer", "trim to bounds", and "fit view to created group"
- [ ] decide whether re-running segmentation on the same source updates the existing group or always creates a new one

### 6. Mask quality and cleanup tools

- [ ] add mask cleanup controls so results are usable without manual pixel surgery
- [x] support feather, expand, contract, fill holes, and small-island removal
- [ ] support edge smoothing or matting for soft-alpha subjects
- [ ] support transparent cutout previews over checkerboard and over the original image
- [ ] define how semi-transparent areas such as hair, smoke, or glass should be handled

### 7. Performance and safety

- [x] avoid blocking the editor during inference; show progress and keep pan/zoom responsive where possible
- [x] add guardrails for very large images: resize strategy, tiling, memory limits, and user warnings
- [ ] cache reusable embeddings or intermediate results if the chosen model supports it
- [ ] make repeated prompt refinement cheap after the first segmentation pass
- [x] define timeout and failure behavior for missing GPU, model load errors, or backend unavailability
  > Execution timeout (120s), AbortController cancellation, error status in UI, and clear error messages for missing API keys.

### 8. Clipboard, import, and external image flows

- [ ] support segmentation on pasted or dropped images, not only on existing layers
- [ ] define how segmentation interacts with the planned input-image-as-layer and reference-layer workflows
- [ ] ensure external images can be segmented before or after being converted into normal editor layers

### 9. Persistence, export, and interoperability

- [x] persist segmentation-generated groups and metadata in document save/load
  > segmentationMeta on layers is serialized/deserialized via normalizeSketchDocument.
- [x] ensure preview/export/render paths treat generated layers like ordinary layers
- [ ] decide whether segmentation metadata is kept only for provenance or also for future re-edit/re-run workflows
- [ ] support exporting the full separated group, individual object layers, and optional masks

### 10. Testing and validation

- [x] add focused tests for model-availability state, missing-model download flow, and apply/cancel behavior
  > 88 tests in segmentation.test.ts covering types, defaults, tool handler, service stub, SamServiceFal, SamServiceNode, backend selection, layer creation, metadata, and overlay utilities.
- [x] add regression tests for generated layer placement, history, save/load, and export
- [x] add coverage for large-image guardrails and inference failure states
- [ ] manually validate common workflows: one object extraction, multiple object separation, prompt refinement, and rerun

## Suggested First Slice

- [x] support one installed `SAM 2` model path
  > fal.ai cloud backend as default, with node execution as alternative.
- [x] run segmentation on the active layer
- [x] allow point or box prompt
- [x] preview one or more masks
- [x] create a new layer group with one raster cutout layer per accepted object
- [x] keep the source layer unchanged
- [x] make the result undoable, movable, paintable, and save/load safe

## Follow-Up Ideas

- [ ] auto-caption or label generated layers
- [ ] background removal shortcut built on the same segmentation path
- [ ] segmentation-assisted selection mode that writes into the selection mask instead of creating layers
- [ ] iterative refine mode where new clicks update one live segmentation session

## MAYBE

- [ ] add a text-guided extraction path using an additional detector or grounding model in front of SAM
- [ ] choose the detector stack for text prompts, for example Grounding DINO plus SAM or another equivalent pipeline
- [ ] support extracting one named category, all matches of a category, or the top N matches
- [ ] define UI wording so users understand text-prompt extraction is not raw SAM behavior
- [ ] derive layer and group labels from detector output when text-guided extraction is used

---
layout: page
title: "PRD: AI Image Editor"
description: "Layer-aware, generation-aware image editing for NodeTool. The clip→workflow pattern from the Timeline, applied to layers."
---

# PRD: NodeTool AI Image Editor

Status: Draft, scoped for Slice 1 + Slice 2.
Owner: Image Editor feature team.
Last updated: 2026-05-09.

## 1. Summary

The AI Image Editor is a **generation-aware, layer-based** image editing surface for NodeTool — a Photoshop-class editor where every layer can be (a) imported, (b) hand-painted, or (c) backed by an embedded NodeTool workflow that generates and re-generates that layer's pixels on demand. Generated layers remember how they were made and can be inspected, tweaked, regenerated, versioned, and round-tripped to the Node Editor without leaving the image.

The editor surface itself already exists on the `sketch-editor-rc` branch: WebGPU-composited layers, 12 blend modes, 15 tools (brush, pencil, eraser, fill, gradient, shapes, transform, crop, blur, clone-stamp, eyedropper, text, select, move, segment), pressure-sensitive painting, layer effects (brightness/contrast, hue/saturation, exposure, curves, tonemap, bloom), SAM segmentation, undo/redo, and a serialized document format. Today that editor lives only as a modal inside the `SketchNode` / `ImageEditorNode` workflow node.

This PRD does two things:

1. **Promote** the existing sketch editor from a node-modal to a **top-level editor** alongside the Workflow (canvas), Chain, Timeline, and Chat editors. Same code, new shell, new route, persistent document model.
2. **Adapt the clip→workflow binding pattern** from the Timeline Editor PRD onto layers. Each generated layer is backed by exactly one `Workflow` row (`run_mode = "layer"`); editing the layer's `Input*` nodes in the inspector queues a regeneration; successful generations append to a per-layer version history and replace the layer's pixel data.

Positioning: **NodeTool Image Editor is a generation-aware Photoshop for AI-driven image production.** Not "another raster editor."

This PRD deliberately mirrors the structure, terminology, and reuse boundaries of `docs/timeline-editor-prd.md`. Where the Timeline says "clip", the Image Editor says "layer". Where the Timeline says "track", the Image Editor says "layer group" or "artboard". Everything else — clone-on-create, dependency hashing, version pruning, linked vs. variation duplication, workflow round-trip, status badges — is the same pattern.

## 2. Scope

### 2.1 In scope (this PRD)

**Slice 1 — Top-level editor shell, imported and painted layers**

- Standalone route `/sketch/:documentId` (top-level entry).
- New `image_document` table and `packages/image-editor/` package for pure types and math.
- Reuse all existing sketch-editor-rc components (`web/src/components/sketch/*`), tools, rendering runtimes (`WebGPURuntime` + `Canvas2DRuntime` fallback), and Zustand slices.
- Persistent document: layers, canvas size, background, active tool, viewport, undo history snapshot — autosaved (debounced) to the new table.
- Imported-layer flow: drag from `AssetExplorer` → new raster layer with `imageReference` pin (existing behavior).
- Painted-layer flow: all 15 tools work as today; results saved into the new document model.
- ModePill in `AppHeader` for the new editor; "Return to Image" pill when round-tripping to Node Editor (same pattern as the Timeline).
- The existing in-node modal mode (opening from `SketchNode`) is preserved unchanged. The same `SketchEditor` component renders in both shells.

**Slice 2 — Generation binding (layers as embedded workflows)**

- New layer kind `generated`. `LayerWorkflowBinding` adds `workflowId`, `selectedOutputNodeId`, `paramOverrides`, `dependencyHash`, `lastGeneratedHash`, `versions[]`.
- Inspector gains a `LayerNodeStack` panel (vertical list of bound nodes; selection drives a `SelectedLayerNodeStore` that feeds `NodePropertyEditor`) — the same shape as the Timeline's `GeneratedClipPanel`.
- Dirty/stale tracking via dependency hash (same hash function as Timeline).
- "Generate Layer" / "Regenerate" wired to `WorkflowRunner` and `GlobalWebSocketManager`.
- Per-layer status badges: `draft`, `queued`, `generating`, `generated`, `stale`, `failed`, `locked`, `missing`.
- "Open in Node Editor" round-trip with `?from=sketch:{documentId}:{layerId}`.
- Three predefined layer templates: **Text-to-Image**, **Inpaint** (mask + prompt), **Background Remove**.
- Per-layer version history (last N successful generations + favorites).
- Workflow lifecycle: clone-on-create with `run_mode = "layer"`, delete-cascade when last referencing layer is deleted, "Save as Reusable Template" promotes to `run_mode = "workflow"` with the `image-template` tag.
- Linked vs. Variation duplication for generated layers.
- "Generate via Inpaint Here" command on a selection: creates a new generated layer above the active layer, prefilled with the current selection mask + the layer beneath as input image.

### 2.2 Out of scope

- Slice 3+: whole-document export pipeline (compile layer stack to a workflow), batch variations (matrix of seeds × prompts → new document), A/B compare across generated layers, multi-shot consistency, scripted batch ops, automated content-aware fill via workflows, palette/color-management workflows, RAW import, animation timeline of layers, multi-user collaborative editing, comments/review.
- Realtime generation (typing-time previews); any "live" inpaint that streams partial pixels back.
- A second image-editor implementation. Anything not in `web/src/components/sketch/` is out of scope; we are not building a competing canvas.

### 2.3 Explicit non-goals

- No left sidebar in the standalone shell beyond the existing tool palette.
- No embedded node-graph canvas inside the inspector — only a vertical node stack identical to the Timeline's.
- No automatic regeneration on edit. Edits mark the layer stale; the user clicks Generate.
- No frame-accurate animation. Layers are still images. Workflows that produce video/audio are not addressable as layers in this PRD.
- No replacement of the existing single-image modal editor at `/assets/edit/:assetId` (`docs/image-editor.md`). That remains a per-asset editor without layers; this PRD's editor is the multi-layer document editor.

## 3. Adaptation principles

The same rule that governed the Timeline PRD applies here:

> Reuse first. Build only what genuinely doesn't exist.

The sketch-editor-rc branch already implements the entire painting/compositing/layering surface. The Timeline already implements the entire clip→workflow binding pattern. This PRD is mostly **the integration of those two existing systems**, not a new build.

| Concern | Reuse | Build |
| --- | --- | --- |
| Layer compositing (GPU) | `web/src/components/sketch/rendering/WebGPURuntime.ts` (12 blend modes, layer effects pipeline) | — |
| Layer compositing (fallback) | `web/src/components/sketch/rendering/Canvas2DRuntime.ts` | — |
| Painting tools (brush, pencil, eraser, blur, clone, fill, gradient, shapes, text, eyedropper, segment, select, move, transform, crop) | `web/src/components/sketch/tools/*` and `painting/*` | — |
| Layers panel, layer groups, alpha lock, blend mode, opacity, visibility | `web/src/components/sketch/SketchLayersPanel.tsx`, `editor-shell/ConnectedLayersPanel.tsx`, `state/slices/documentSlice.ts` | — |
| Selection (rect, ellipse, lasso, magic wand) and finalization | `web/src/components/sketch/selection/*`, `state/slices/selectionSlice.ts` | — |
| Layer effects (brightness/contrast, hue/sat, exposure, curves, tonemap, bloom) | existing non-destructive effect chain on `Layer.effects` | — |
| Pressure / stabilization / symmetry | `painting/StabilizerBuffer.ts`, symmetry modes in `toolSlice` | — |
| SAM segmentation (FAL + local backends) | `web/src/components/sketch/sam/*` | — |
| Undo/redo (max 30 snapshots) | `state/slices/historySlice.ts` | — |
| Keyboard shortcut catalog and dispatcher | `shortcuts/*` | — |
| Per-layer input/output handles on `SketchNode` | `Layer.exposedAsInput` / `exposedAsOutput`, `web/src/components/node/SketchNode/SketchNode.tsx` | — |
| **Per-layer workflow** | **`Workflow` model — each generated layer is a workflow row** with `run_mode = "layer"` | — |
| **Exposed parameters** | **Existing `*InputNode` classes** (`StringInputNode`, `IntegerInputNode`, `FloatInputNode`, `ImageInputNode`, `MaskInputNode`, `SelectInputNode`, `ImageSizeInputNode`, `ColorInputNode`, `LanguageModelInputNode`, `BooleanInputNode`, `SeedInputNode`) — Input nodes ARE the exposed parameters | — |
| Inspector frame | `web/src/components/Inspector.tsx`, `InspectedNodeStore` | Slim wrapper that swaps target between layer / layer-bound node |
| Property editing | `web/src/components/node/PropertyField.tsx`, `web/src/components/properties/*` | — |
| Workflow templates | Existing template/preset infrastructure + `tags` | Three image-targeted seeded workflows tagged `image-template` |
| Open in Node Editor | Existing workflow editor at `/editor/:workflowId` + `?from=` query convention | Just navigate; no remap |
| Execution | `WorkflowRunner.run(workflow, paramOverrides)`, `GlobalWebSocketManager`, `Job` | Layer-scoped subscription, hash-based stale detection |
| Status / errors | `StatusStore`, `ErrorStore`, `StatusIndicator`, `WarningBanner` | Layer-status mapping |
| Past outputs | `ResultsStore`, `NodeResultHistoryStore`, `MediaGenerationStore`, `Job.outputs` | Layer-version index (jobId + assetId per version) |
| Top bar | `AppHeader`, `ModePills` | Image-Editor pill + scoped action set |
| UI primitives | `web/src/components/ui_primitives/*` (mandatory; no raw MUI) | — |
| Data models | `Workflow`, `Job`, `Asset`, `Prediction` in `packages/models` | New `ImageDocument` only |
| **tRPC clip lifecycle** (clone-on-create, delete-cascade, linked/variation duplicate, template promotion via tag + `run_mode` flip) | `packages/websocket/src/trpc/routers/timeline.ts` — copy the `clips.{create, delete, duplicate}` logic verbatim, retargeted to `layers.*` | — |

The sketch-editor-rc branch is **kept in tree**. This PRD does not rewrite the sketch editor; it wraps it. The Timeline PRD's choice to rewrite a 12k-line PR from scratch does not apply here, because the sketch-editor-rc code is already production-quality (94 test files, WebGPU-accelerated, four months of focused work).

## 4. Architecture

### 4.1 Packages

- **New: `packages/image-editor/`** — pure types and pure functions, mirroring `packages/timeline/`.
  - `types.ts` — `ImageDocument`, `LayerBinding`, `LayerVersion`, `LayerStatus`, `LayerWorkflowKind`. The pixel data, transform, and effects already live in `web/src/components/sketch/types/document.ts`; this package adds **only the binding/versioning fields**, not the full Layer type. The Web `Layer` type extends from this.
  - `dependencyHash.ts` — same deterministic hash function as `packages/timeline/src/dependencyHash.ts`. Hash inputs: `{ workflowId, workflow.updated_at, paramOverrides, currentInputAssetHashes }`.
  - `seedLayerTemplates.ts` — the three seeded `image-template` workflow definitions.
  - No React, no Zustand, no MUI. Vitest unit tests.

- **`packages/models/`** —
  - **Reuse `Workflow`**. Each generated layer references an existing `Workflow` row via `workflowId`. The `run_mode` field gains a new value:
    - `"workflow"` — standalone workflow (existing default; unchanged).
    - `"clip"` — Timeline-private clone (existing).
    - `"sequence"` — reserved for Timeline Slice 3 (existing).
    - **`"layer"`** — Image-Editor-private clone owned by a single layer. Hidden from the standalone workflow list. New value; no schema migration (column is text).
    - `"image"` — reserved for a future slice where the entire document compiles to one workflow. Not implemented here.
    The standalone workflow listing filters to `run_mode IN ("workflow", null)`. Curated layer templates are tagged `image-template`. The Add-Generated-Layer menu shows tagged workflows by default with an "All workflows" option to browse the rest.
  - **Add `image_document` table** — modelled on `timeline_sequence`:
    ```sql
    CREATE TABLE image_document (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      workflow_id     TEXT,                         -- reserved for run_mode = "image" in a future slice
      name            TEXT NOT NULL,
      width           INTEGER NOT NULL DEFAULT 1024,
      height          INTEGER NOT NULL DEFAULT 1024,
      background_color TEXT NOT NULL DEFAULT '#ffffff',
      document        TEXT NOT NULL,                -- JSON: layers[], guides[], artboards[], activeLayerId, maskLayerId, viewport
      thumbnail_asset_id TEXT,                      -- last flattened thumbnail (debounced)
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE INDEX idx_image_document_user    ON image_document(user_id);
    CREATE INDEX idx_image_document_project ON image_document(project_id);
    CREATE INDEX idx_image_document_updated ON image_document(updated_at);
    ```
    Layers live inside `document` (JSON) to keep migrations cheap and to match the JSON-blob pattern already used by `timeline_sequence`. Generated assets stay in `asset` table; per-layer versions reference asset ids.

### 4.2 Web

- **Route**: `/sketch/:documentId` (standalone). New top-level entry in `web/src/index.tsx`. The existing in-node modal (opened from `SketchNode`) is unchanged.
- **Components** (additive only — almost everything is reused under `web/src/components/sketch/`):
  - `web/src/components/sketch/SketchEditorPage.tsx` (new) — page shell. Composes `AppHeader` (with new ModePill active), the existing `ConnectedToolbar` / `ConnectedToolTopBar` / `SketchCanvasPane` / `ConnectedLayersPanel` / `ConnectedContextMenu`, plus the new `SketchInspectorPanel` (Slice 2). No raw MUI.
  - `web/src/components/sketch/Inspector/SketchInspector.tsx` (new, Slice 2) — root; swaps between `ImportedLayerPanel`, `PaintedLayerPanel`, and `GeneratedLayerPanel` based on selection. Mirrors `TimelineInspector.tsx`.
  - `web/src/components/sketch/Inspector/GeneratedLayerPanel.tsx` (new, Slice 2) — header (thumbnail, name, type, status, model summary, timestamps), `LayerNodeStack`, `NodePropertyEditor`, `LayerActions` (Generate / Regenerate / Duplicate-as-Variation / Duplicate Linked / Open in Node Editor / Reset Seed / Randomize Seed / Lock / Revert / Save as Template), `VersionList`. Direct port of `GeneratedClipPanel.tsx`.
  - `web/src/components/sketch/Inspector/LayerNodeStack.tsx` (new, Slice 2) — vertical list of the bound workflow's `Input*` nodes; selection drives `SelectedLayerNodeStore`. Mirrors `NodeStack.tsx`.
  - The existing `SketchToolbar`, `SketchLayersPanel`, `SketchModal`, all rendering and painting code: **no changes**. The standalone shell mounts the same components inside a different layout host.

- **Stores** under `web/src/stores/sketch/` (additive):
  - `useSketchStore` — **reuse as-is**. Already exists on the branch; already composes `documentSlice`, `historySlice`, `toolSlice`, `selectionSlice`, `viewportSlice`, `uiSlice`. Slice 2 adds `bindingSlice` for `paramOverrides` mutations and dependency-hash recomputation.
  - `SketchDocumentStore` (new, thin) — Zustand store that bridges `useSketchStore` (the in-memory document) and the persisted `image_document` row (id, baseUpdatedAt, last server hash). Owns the autosave debounce, optimistic-concurrency token, and "Return to Sketch" routing param.
  - `SketchGenerationStore` (new, Slice 2) — per-layer job ids, mapping back to `WorkflowRunner` / `GlobalWebSocketManager` subscriptions. Direct port of `TimelineGenerationStore`. Emits status transitions read by `LayerNodeStack` and the layers panel.
  - `SelectedLayerNodeStore` (new, Slice 2) — selection state inside the inspector's node-stack, identical pattern to `SelectedClipNodeStore`.
  - All stores follow project rules: typed selectors, `shallow` for multi-value selections, no full-store subscribes. `useSketchStore` already does this correctly.

- **Server state**: TanStack Query for `imageDocument`, `layerVersions`, `assetThumbnails`. Keys hierarchical: `["sketch", documentId, ...]`.

- **Persistence**: tRPC router added to `packages/websocket/src/trpc/routers/sketch.ts`, mirroring `timeline.ts`:
  - `sketch.list(projectId?)`, `sketch.get(id)`, `sketch.create(input)`, `sketch.update(id, document, baseUpdatedAt?)`, `sketch.delete(id)`.
  - `sketch.versions.{ list, append, setFavorite, delete }`.
  - `sketch.layers.{ create, delete, duplicate }` — with `mode: "linked" | "variation"` on duplicate, and clone-on-create with `run_mode = "layer"`. Implementation is a copy of the Timeline's `clips.*` procedures retargeted at the new table and `run_mode` value.

- **AppHeader** (`web/src/components/panels/AppHeader.tsx`) — add an **Image Editor** ModePill alongside Editor / Chat / App / Timeline. Wire the "Return to Sketch" pill for `?from=sketch:{documentId}:{layerId}` round-trips, mirroring `?from=timeline:` exactly.

### 4.3 Layer → Workflow binding

Every generated layer is backed by exactly one `Workflow` row.

- **Imported layers** keep their existing `imageReference` / `data` model. `workflowId === null`. No node-stack in inspector.
- **Painted layers** are pure raster (`data: string | null`, the existing PNG data URL). `workflowId === null`. No node-stack in inspector.
- **Generated layers** have `workflowId` set. The workflow's graph contains its own `Input*` nodes (`StringInputNode`, `IntegerInputNode`, `FloatInputNode`, `ImageInputNode`, `MaskInputNode`, `SelectInputNode`, `ImageSizeInputNode`, `ColorInputNode`, `LanguageModelInputNode`, `SeedInputNode`, etc.). **The Input nodes ARE the exposed parameters** — no parallel `ExposedParameter` declaration on the layer.
- The layer stores **`paramOverrides: Record<inputNodeName, value>`** — the inputs to feed the workflow on each invocation. The inspector renders one `PropertyField` per `Input*` node in the bound workflow, sourced from existing node metadata. This is the same path the standalone workflow editor and the Timeline both already use.
- The layer stores **`selectedOutputNodeId`** — which terminal node's output becomes the layer's pixel data. Workflows with one obvious media-output node default to it; multi-output workflows force a choice on creation. The output node must be `ImageOutputNode` (raster layers) or, for mask layers, may also be `MaskOutputNode`. Video/audio outputs are not addressable as layer sources.
- The layer's existing `data` field (PNG data URL) is the **rendered output** — set by the generation pipeline on success. Until first generation, `data === null` and the layer composites as transparent (with a "Draft" badge in the layer panel, see §5.5).
- The existing `Layer.exposedAsInput` and `Layer.exposedAsOutput` flags continue to govern dynamic handles on the workflow-graph `SketchNode`. They are independent of `workflowId` (an exposed-input layer can still be generated; its handle just lets a parent workflow override its pixel data at run time).

**Lifecycle** (verbatim port of the Timeline's clip lifecycle):

- Creating a generated layer from any standalone workflow (via the Add-Generated-Layer menu, or "Use as layer" from a workflow's context menu): the editor **clones** that workflow into a new `run_mode = "layer"` row owned by the layer. The clone is independent — editing the source workflow later does not affect existing layers. (Linked-duplicate behavior is opt-in per layer-pair, see below.)
- **Duplicate as Variation** clones the layer's workflow into another `run_mode = "layer"` row.
- **Duplicate Linked** keeps the same `workflowId` for both layers; both regenerate together.
- **Save as Reusable Template** flips `run_mode` from `"layer"` to `"workflow"` and adds the `image-template` tag, promoting the clone into a normal standalone workflow that appears in the curated layer menu. The layer retains its reference. Once promoted, ordinary workflow-listing rules apply.
- **Deleting a layer** with a `run_mode = "layer"` workflow: if no other layer references that `workflowId`, the workflow row is deleted. Otherwise (linked duplicates), the row is kept and only the layer reference is removed. Standalone (`run_mode = "workflow"`) sources are never deleted by layer operations.
- **Open in Node Editor** navigates to `/editor/:workflowId?from=sketch:{documentId}:{layerId}`. Returning to the editor picks up the new `workflow.updated_at`, which automatically marks all referencing layers stale (see §4.4).

### 4.4 Generation flow

1. User edits an `Input*` node's value in the inspector (or, for a generated layer with an `ImageInputNode`, paints/replaces the input image of an upstream layer).
2. `useSketchStore.setLayerParamOverride(layerId, inputNodeName, value)` (new in Slice 2):
   - Updates `paramOverrides`.
   - Recomputes the layer's `dependencyHash` (workflowId + workflow.updated_at + paramOverrides + input-asset hashes).
   - If `dependencyHash !== lastGeneratedHash`, sets layer `status = "stale"`.
3. UI updates: layer badge in `SketchLayersPanel` shows `Stale`; the canvas keeps showing the last successful version with a stale overlay (the existing layer-thumbnail border is reused with a warning hue).
4. User clicks **Generate Layer**:
   - `WorkflowRunner.run(workflow, { params: paramOverrides })` — exactly the same call the standalone editor and the Timeline use.
   - Subscribe via `GlobalWebSocketManager` keyed by `jobId`.
   - On `NodeUpdate`/`Prediction`/`JobUpdate` events, `SketchGenerationStore` updates per-layer status; the inspector's node-stack reads existing `StatusStore`/`ResultsStore` keyed on the bound workflow's nodes — no duplication.
   - On success: append a `LayerVersion { jobId, assetId, hash, … }`, set `data = <new PNG data URL>` (downloaded once from the job's output asset), `lastGeneratedHash = dependencyHash`, layer `status = "generated"`. The layer's `imageReference` is also set so re-opens don't have to re-decode.
5. Failure: layer `status = "failed"`, error pulled from existing `ErrorStore` keyed by jobId+nodeId; primary action becomes **Retry**.

There is no "Generate node + downstream" command at the layer level — partial-graph execution is a workflow-runner concern. If a user needs that level of control, they open the workflow in the Node Editor.

### 4.5 Reuse rules and migration

- **No raw MUI imports** in any new file. Use primitives from `web/src/components/ui_primitives/*`. `FlexRow` / `FlexColumn` over `Box sx={{ display: 'flex' }}` when shorthand suffices.
- Theme tokens only; no hardcoded colors or spacing.
- All inter-package imports use `@nodetool-ai/<package>`. Never import from `dist/`.
- All new files are TypeScript strict mode; no `any`.
- Functional React components; typed props.
- The existing sketch-editor-rc code already complies with the above. Do not regress.

## 5. UX

### 5.1 Layout (standalone shell)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AppHeader      [Editor] [Chat] [App] [Timeline] [Image]   …  Project ▾  │
├──────────────────────────────────────────────────────────────────────────┤
│ Tool   │                                            │  Inspector         │
│ palette│              SketchCanvasPane              │  (layer-aware)     │
│ (left) │       (existing WebGPU/Canvas2D canvas)    │  + Layers panel    │
│  V C B │                                            │                    │
│  E G T │                                            │                    │
│  R O L │                                            │                    │
│  S X … │                                            │                    │
├──────────────────────────────────────────────────────────────────────────┤
│ ToolTopBar (per-tool options) — existing ConnectedToolTopBar             │
└──────────────────────────────────────────────────────────────────────────┘
```

- The left tool palette and top tool-options bar are the existing `ConnectedToolbar` and `ConnectedToolTopBar` from `editor-shell/`.
- The right panel is the existing `ConnectedLayersPanel` plus a new collapsible inspector (Slice 2).
- No bottom panel in Slice 1+2. Status (autosave state, generating count, error count) lives as a slim badge cluster in the AppHeader area, mirroring the Timeline's choice.
- Modal mode (opened from `SketchNode`) is unchanged: same components, fullscreen portal.

### 5.2 Tool palette and tool top bar

No changes to the existing tools. They are listed here so the PRD is self-contained for review:

- **Selection / navigation**: Select (rect / ellipse / lasso / magic wand), Move, Transform (free / crop / perspective / warp).
- **Painting**: Brush, Pencil, Eraser, Blur, Clone Stamp.
- **Fill / color**: Fill (flood with tolerance), Eyedropper, Gradient (linear / radial).
- **Shapes / geometry**: Shape (line / rectangle / ellipse / arrow), Crop.
- **Adjustment / AI**: Adjust (brightness/contrast/hue/sat live preview), Segment (SAM-powered).

All tool settings (brush size, opacity, hardness, pressure curves, tolerance, stroke width, fill color, symmetry mode, ray count) are unchanged.

### 5.3 Layers panel

The existing `SketchLayersPanel` already supports CRUD, reorder, visibility, opacity, blend mode, alpha lock, groups, expand/collapse. Slice 2 adds:

- **Status badge** on each layer row (using existing `StatusIndicator` primitive): `Draft`, `Queued`, `Generating`, `Generated`, `Stale`, `Failed`, `Locked`, `Missing`. Color coding identical to Timeline clip status.
- **Layer kind icon**: bitmap (imported), brush (painted), spark (generated), mask, group folder.
- **Add-Generated-Layer menu** at the top of the panel, alongside the existing `+ Layer` button. Lists workflows tagged `image-template` first, then "All workflows" expander filtered to `run_mode IN ("workflow", null)` and terminating in `ImageOutputNode` / `MaskOutputNode`.

### 5.4 Inspector

Three states:

- **Imported layer selected** — `ImportedLayerPanel`: name, source asset, transform, opacity, blend mode, alpha lock, effects chain, output handle toggle. Actions: Replace Source, Reveal in Library, Convert to Painted Layer, Convert to Generated Layer (prompted to pick a workflow that can accept this layer's pixels via an `ImageInputNode`).
- **Painted layer selected** — `PaintedLayerPanel`: name, transform, opacity, blend mode, alpha lock, effects chain. Actions: Convert to Generated Layer (turn this raster into the seed image of a chosen workflow's `ImageInputNode`), Save as Asset.
- **Generated layer selected** — `GeneratedLayerPanel` (Slice 2): header (thumbnail, name, type, status, model summary, timestamps); `LayerNodeStack`; `NodePropertyEditor` for the selected node; `LayerActions`; `VersionList`. Direct visual port of `GeneratedClipPanel`.

Selecting a node in the stack drives `SelectedLayerNodeStore`, which `NodePropertyEditor` reads. This mirrors the existing `InspectedNodeStore` → `Inspector` → `PropertyField` pattern and the Timeline's `SelectedClipNodeStore`.

### 5.5 Status badges

| Status | Source | Display |
| --- | --- | --- |
| `draft` | binding exists, no version yet | dim border, "Draft" |
| `queued` | job queued | spinner outline |
| `generating` | `JobUpdate.status = running` | progress bar across layer thumbnail |
| `generated` | latest hash matches | normal |
| `stale` | hash mismatch | yellow badge "Stale" overlay on thumbnail |
| `failed` | `JobUpdate.status = failed` | red badge, error tooltip |
| `locked` | user-set | lock icon |
| `missing` | layer's last asset id no longer resolvable | gray placeholder thumbnail |

Badges use `StatusIndicator` and tokenized colors. Same source/display rules as the Timeline.

### 5.6 New affordance: Generate via Inpaint Here

When a user has an active selection and clicks **Generate via Inpaint Here** in the Adjustments / Layer menu:

1. A new generated layer is created above the active layer.
2. Its workflow is the seeded **Inpaint** template (cloned to `run_mode = "layer"`).
3. `paramOverrides` are pre-populated:
   - `image` ← rasterized snapshot of the layers below the new layer (clipped to selection bounds, with a small padding)
   - `mask` ← the current selection mask, exported via the existing `selection/selectionMask.ts` helpers
   - `prompt` ← empty (focus moves to it)
4. The user types a prompt, hits Generate. The result composites with the current selection as a clip, so the generated pixels only land inside the selection.

This is the single most important Slice 2 affordance for the "Photoshop with AI" positioning. It is what turns the editor from "a layer panel with workflows" into "the natural place to do AI inpainting." It costs almost nothing on top of Slice 2 because the selection mask, the rasterizer, and the Inpaint template all already exist.

## 6. Decisions on open questions

1. **Auto-replace on success.** Successful generation replaces the layer's `data` immediately; previous version stays in `versions[]`. Locked layers do not replace.
2. **Cloned workflow per layer, not embedded snapshot.** Each generated layer points to its own `Workflow` row with `run_mode = "layer"`. Cloning happens at layer creation, regardless of whether the source was a curated template or a user's standalone workflow. Editing one layer's workflow does not affect others. This matches the Timeline's choice.
3. **Inspector exposes the bound workflow's `Input*` nodes.** No parallel exposed-parameter declaration. The author of a layer-template workflow chooses what's exposed by which `Input*` nodes they place in the graph.
4. **Document format.** New `image_document` table (decided). Documents themselves are not workflows in Slice 1+2; reserved as `run_mode = "image"` for a future slice.
5. **Layer pixel storage.** Continue the existing `data: string | null` (PNG data URL) approach used on the sketch-editor-rc branch. For generated layers, also store `imageReference.uri` pointing at the asset; the data URL is the cached decode. Documents larger than ~10 MB should be migrated to per-layer asset references in a future slice — flagged as a Risk in §12.
6. **Variants.** Stored in `versions[]` on the layer (each version = `{ jobId, assetId, hash }`). Separate-layer variants are produced by Duplicate as Variation, which clones the layer's workflow into a new `run_mode = "layer"` row.
7. **Render All / Flatten.** "Flatten visible" already exists on the branch (CPU); add "Re-generate Stale Layers" command that runs the existing job pipeline for every stale layer in dependency order and shows a preflight dialog with Generate Stale / Skip Stale / Cancel. No timeline-style "Render All" export pipeline in Slice 1+2.
8. **Local vs cloud per node.** Backend decides via existing provider routing; UI shows `Local` / `Cloud` / `Requires API key` indicators (same as Timeline).
9. **Custom exposed parameters.** Out of scope. The layer-template workflow author chooses exposure by which `Input*` nodes are placed.
10. **Multi-output layers.** Out of scope. One `selectedOutputNodeId` per layer; multi-output workflows force a choice at layer creation. A future slice may introduce "satellite layers" for side outputs (e.g. one workflow run produces both an image and a depth map).
11. **Workflow listing filter.** Standalone workflow listings filter to `run_mode IN ("workflow", null)`. `"layer"` workflows are visible only inside their owning document. The Add-Generated-Layer menu queries `run_mode IN ("workflow", null)` and prefers entries tagged `image-template`, with an "All workflows" expander to browse the rest.
12. **Layer-workflow lifecycle.** Deleting the last layer referencing a `run_mode = "layer"` workflow deletes that workflow. Promoting via "Save as Reusable Template" flips `run_mode` from `"layer"` to `"workflow"` and adds the `image-template` tag — the row becomes an ordinary standalone workflow.
13. **Relationship to the existing per-asset image editor at `/assets/edit/:assetId`.** That stays. It is a single-image, single-layer editor for ad-hoc asset edits and does not need workflows. The new `/sketch/:documentId` editor is the multi-layer document editor. The existing in-node modal opened from `SketchNode` continues to work and shares all components with the standalone shell.
14. **Relationship to `SketchNode` in the workflow graph.** A `SketchNode` references an `image_document` by id. Clicking "Edit" on the node either opens the standalone editor (`/sketch/:id`) or the modal — controlled by a per-user preference, defaulting to modal for one-handed quick edits and standalone for "open and stay" sessions. The dynamic per-layer input/output handles on `SketchNode` (`exposedAsInput` / `exposedAsOutput`) are unchanged.

## 7. Data model

```ts
type LayerStatus =
  | "draft" | "queued" | "generating" | "generated"
  | "stale" | "failed" | "locked" | "missing";

type LayerKind = "imported" | "painted" | "generated" | "mask" | "group";

interface ImageDocument {
  id: string;
  projectId: string;
  workflowId?: string;          // reserved for run_mode = "image" (future)
  name: string;
  width: number;                // canvas px
  height: number;
  backgroundColor: string;
  layers: Layer[];              // existing sketch-editor-rc Layer, extended (below)
  guides: Guide[];
  artboards: Artboard[];        // optional Slice 1+; multi-artboard reserved for future
  activeLayerId: string;
  maskLayerId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Existing Layer from web/src/components/sketch/types/document.ts is extended with:
interface LayerWorkflowBinding {
  kind: LayerKind;                              // replaces `type: "raster" | "mask" | "group"`; "imported" | "painted" | "generated" merge into the raster slot
  workflowId?: string;                          // run_mode = "layer" for generated layers
  selectedOutputNodeId?: string;
  paramOverrides?: Record<string, unknown>;     // keyed by Input-node name
  dependencyHash?: string;
  lastGeneratedHash?: string;
  status: LayerStatus;
  versions: LayerVersion[];
  // Existing fields from the sketch-editor-rc Layer remain unchanged:
  // id, name, visible, opacity, locked, alphaLock, blendMode, data, transform,
  // contentBounds, exposedAsInput, exposedAsOutput, imageReference, parentId,
  // collapsed, segmentationMeta, effects.
}

interface LayerVersion {
  id: string;
  createdAt: string;
  jobId: string;             // FK to existing Job model
  assetId: string;           // FK to existing Asset model (the generated PNG)
  workflowUpdatedAt: string; // snapshot of workflow.updated_at at generation time
  dependencyHash: string;
  paramOverridesSnapshot: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status: "success" | "failed" | "cancelled";
  favorite?: boolean;        // pinned to prevent pruning
}

interface Guide {
  id: string;
  axis: "x" | "y";
  position: number;          // px in document space
}

interface Artboard {
  id: string;
  name: string;
  x: number; y: number;
  width: number; height: number;
}
```

The existing `Layer.type` enum on sketch-editor-rc (`"raster" | "mask" | "group"`) is widened by introducing `kind` as the source of truth. A migration on document load splits the existing `"raster"` into `"imported"` (if `imageReference != null`), `"painted"` (otherwise with non-null `data`), or `"generated"` (if `workflowId` is set — only possible for documents created in Slice 2). New documents in Slice 1 only ever produce `imported`, `painted`, `mask`, `group`.

## 8. Curated layer templates (Slice 2)

Three ordinary `Workflow` rows (`run_mode = "workflow"`) are seeded with the tag `image-template` so they surface in the Add-Generated-Layer menu by default. Authors publish their own layer templates by adding the `image-template` tag to any workflow they own. Untagged standalone workflows that produce image output are still selectable via the menu's "All workflows" expander.

| Seeded workflow | Graph (Input nodes → processing → output) |
| --- | --- |
| **Text-to-Image** | `StringInputNode("prompt") → TextToImageNode → ImageOutputNode`<br>plus optional `StringInputNode("negative_prompt")`, `IntegerInputNode("steps")`, `FloatInputNode("cfg")`, `SeedInputNode("seed")`, `LanguageModelInputNode("model")`, `ImageSizeInputNode("size")` |
| **Inpaint** | `ImageInputNode("image") + MaskInputNode("mask") + StringInputNode("prompt") + SeedInputNode("seed") → InpaintNode → ImageOutputNode` |
| **Background Remove** | `ImageInputNode("image") → RemoveBackgroundNode → ImageOutputNode` (output is a transparent PNG; ideal as a layer above the source) |

When a user picks a template, the editor clones it into a new `run_mode = "layer"` workflow owned by the layer. No template registry; the menu is just a tag-filtered query against the workflow table. Future templates worth seeding (not in this PRD's scope) are listed in §12 as candidates.

## 9. Performance targets

- Smooth interaction (60 fps where possible) at 4096×4096 with ≤30 layers on WebGPU; ≤2048×2048 with ≤15 layers on Canvas2D fallback. (The branch already meets these for painting; this PRD does not regress them.)
- Select layer: <100 ms UI response.
- Open document: editor visible <2 s; layer thumbnails hydrate progressively.
- Generation job creation: <500 ms.
- Inspector property edit: immediate local response; hash recompute <16 ms for typical layer.
- Document autosave: debounced 2 s, identical to Timeline.
- Document JSON cap before forced asset-extraction migration: 8 MB (warned), 16 MB (hard limit). See §12.

## 10. Acceptance criteria

The combined Slice 1 + 2 ships when:

1. User can create a new image document and the editor opens at `/sketch/:id` with a default canvas (1024×1024 white) and one painted layer.
2. The Image Editor ModePill in `AppHeader` is highlighted on `/sketch/*`.
3. All 15 existing tools work in the standalone shell exactly as in the modal.
4. User can drag assets from `AssetExplorer` to create imported layers.
5. User can rename, reorder, group, hide, lock, alpha-lock, opacity-adjust, and blend-mode-change layers (existing functionality, exercised through the new shell).
6. User can undo and redo across painting, layer ops, and (Slice 2) generation, with the existing history slice.
7. User can add Text-to-Image, Inpaint, and Background-Remove generated layers from a layer-template menu.
8. Selecting a generated layer opens the node-stack inspector; selecting a node shows its exposed params.
9. Editing a property marks the layer stale; the canvas keeps showing the previous version with a stale overlay on the layer thumbnail.
10. User can generate the selected layer, observe progress on its layer thumbnail, and see the new pixels composite immediately.
11. The previous version is preserved in `versions[]` and restorable.
12. "Open in Node Editor" navigates to `/editor/:workflowId?from=sketch:{documentId}:{layerId}`. On return, the layer is automatically marked stale if `workflow.updated_at` advanced; the inspector reflects any added/removed `Input*` nodes.
13. Failed generations show error UI on the layer and a Retry action; errors are attached to the failing node.
14. **Generate via Inpaint Here** with an active selection produces a new generated layer pre-bound to the Inpaint template with the right image+mask seeded.
15. Document autosave round-trips through the new tRPC router with optimistic-concurrency conflict detection.
16. The existing in-node modal mode (opened from `SketchNode`) continues to work; both shells render the same components.
17. No raw MUI imports anywhere in any new file under `web/src/components/sketch/SketchEditorPage.tsx`, `web/src/components/sketch/Inspector/*`, or the new tRPC client surfaces.
18. `npm run check` passes (typecheck + lint + tests) for `packages/image-editor/`, `packages/models/` migrations, `packages/websocket/` (new tRPC router), and `web/`.

## 11. Rendering

The image editor has two rendering pipelines. Both are simpler than the Timeline's because the document is a single still image, not a time-axis-driven composition.

### 11.1 Canvas rendering (in-browser, real-time)

Goal: render the layer stack at the viewport's zoom and pan, at interactive frame rates, with all paint and effect edits visible immediately.

**Approach**: **Reuse the existing `WebGPURuntime` and `Canvas2DRuntime` from the sketch-editor-rc branch.** No new compositor. The runtimes already implement:

- Per-layer texture upload with dirty-rect tracking.
- All 12 blend modes.
- The full layer-effects pipeline (brightness/contrast, hue/saturation, exposure, curves, tonemap, bloom).
- WebGPU device-loss fallback to Canvas2D.
- GPU mask compositing for selection ants and committed selections (added on the branch in May 2026).

The standalone shell mounts the same `SketchCanvasPane` that the modal uses. No additional rendering work is required for Slice 1.

For Slice 2 (generated layers), rendering does **not** change. A generated layer is a normal raster layer once it has `data`. Until it does, the runtime composites it as a placeholder (transparent with a "Draft" tile pattern, an extension to `Canvas2DRuntime`'s placeholder rendering already used by `imageReference.uri` not-yet-loaded layers).

### 11.2 Export rendering (flatten + save / send to workflow)

Goal: produce a final PNG (or JPG, WebP) that matches the canvas, plus the existing per-layer export the `SketchNode` already does.

**Strategy**: the editor does not ship its own multi-layer export pipeline beyond what the branch already has. The existing `flattenVisible()` and `flattenDocument()` (in `documentSlice` and `Canvas2DRuntime`'s `maskAndExport.ts`) cover Slice 1+2:

- **Save / Download**: flatten visible layers → PNG. Already implemented on the branch.
- **Save flatten as Asset**: flatten → POST to existing asset endpoint. Already implemented on the branch.
- **Per-layer export to `SketchNode` outputs**: existing path. Unchanged.
- **Mask export**: existing `exportMask()` writes the designated mask layer. Unchanged.

A future slice can add a graph-compiled export (analogous to the Timeline's `compileExport.ts`) that re-runs every generated layer through `WorkflowRunner` to produce a fully reproducible flat output from current parameters rather than from cached pixels — useful for "lock the final after parameter sweeps" workflows. Not in scope here.

**Constraints flowing back into the data model**: the `LayerVersion.assetId` must be a real asset row (not just a data URL) so that future graph-compiled exports can reference the same asset that was used in the canvas. The branch already stores generated bitmaps as data URLs in `Layer.data`; Slice 2 must additionally upload each generation's output to the asset table and record `assetId`. This is one of the few non-trivial new pieces of code (~80 lines, in the success branch of step 5 in §4.4).

## 12. Risks and mitigations

- **Document JSON growth.** PNG data URLs for many large layers can blow past SQLite's recommended row size. Mitigation: cap the document to 8 MB warned / 16 MB hard; for any layer larger than 1 MB, store its bitmap as a separate asset row and reference by `assetId` instead of inlining a data URL. The branch already has `imageReference.uri` for this; Slice 1 must extend autosave to externalize oversized layers.
- **Workflow run-mode collisions.** Adding `"layer"` and reserving `"image"` in `run_mode` requires the standalone listing filter to be tightened consistently. Mitigation: introduce a typed enum `WorkflowRunMode` in `packages/protocol/` and update every list/filter call in one PR before this work begins.
- **Sketch editor not yet merged to main.** This PRD assumes `sketch-editor-rc` lands first. If the merge is delayed, Slice 1's "promote to top-level" depends on a moving target. Mitigation: merge sketch-editor-rc to main in its current modal-only state first; Slice 1 of this PRD is then additive and small.
- **WebSocket message volume during generation.** Mitigation: subscribe per-layer's active job id; drop all other traffic at the sketch-store boundary. Same approach the Timeline took.
- **Graph-structure drift on Open in Node Editor round-trip.** Mitigation: on return, diff node ids; if `selectedOutputNodeId` is gone or no longer an `ImageOutputNode` / `MaskOutputNode`, force a confirmation dialog before any subsequent generation.
- **Reuse boundary slipping.** Mitigation: PR review checklist enforces "no parallel canvas/inspector/store code outside `web/src/components/sketch/`", "no raw MUI", "stores via selectors with `shallow`".
- **Naming confusion: sketch vs. image vs. asset editor.** Three editors, three concepts. Mitigation: docs page (`docs/image-editor-prd.md` for this PRD; a follow-up to `docs/image-editor.md` to disambiguate the per-asset modal at `/assets/edit/:assetId`); ModePill label is "Image Editor"; route is `/sketch/:documentId` (matches code dir); type/table is `image_document`.
- **Inpaint quality / model availability.** The seeded Inpaint template must not require a paid API key out of the box. Mitigation: pick a default that runs on the bundled local stack (e.g. an SDXL-Inpaint variant via the existing `runtime` providers), with an opt-in cloud upgrade path through the existing provider routing.

## 13. Implementation phases inside this PRD

1. **P0 — Prerequisites (not part of Slices 1/2 but blocking).**
   - Merge `sketch-editor-rc` to main as-is (modal-only). The `image-template` tag is unused but harmless.
   - Introduce `WorkflowRunMode` enum and tighten standalone-listing filter to `run_mode IN ("workflow", null)`.

2. **P1.A — `packages/image-editor/` types, dependency hashing, seed-template definitions, tests.** No UI.

3. **P1.B — `image_document` schema, ORM class, tRPC router (`sketch.list/get/create/update/delete` and `sketch.versions.*`), autosave hook.** Seed three `image-template`-tagged workflows in a migration.

4. **P1.C — `SketchEditorPage` shell, route registration, ModePill, "Return to Sketch" pill, per-user preference for modal-vs-standalone open from `SketchNode`.** Connects existing components with the new shell. No new tools.

5. **P1.D — Imported and painted layer flows wired to the new persistence layer, undo/redo across save boundaries, asset-extraction for oversized layers.** No generated layers yet.

6. **P2.A — `tRPC sketch.layers.{create, delete, duplicate}` (clone-on-create with `run_mode = "layer"`, delete-cascade, linked/variation duplicate, template promotion via tag + `run_mode` flip).** Direct retargeting of the Timeline's `clips.*` procedures.

7. **P2.B — Inspector node-stack and `NodePropertyEditor` reading the bound workflow's `Input*` nodes; dirty/stale via dependency hash incl. `workflow.updated_at`.**

8. **P2.C — Generate / regenerate via `WorkflowRunner.run(workflow, paramOverrides)`; status propagation through existing `StatusStore` / `ResultsStore` / `ErrorStore` keyed by jobId; per-layer `LayerVersion` append with asset upload.**

9. **P2.D — Versions (jobId+assetId per version), restore, Duplicate-as-Variation, Duplicate-Linked, Lock; "Open in Node Editor" round-trip and stale-on-return behavior; "Generate via Inpaint Here" command.**

Each phase ends with passing `npm run check` and a self-contained PR.

---

## Appendix A — Mapping to the Timeline PRD

For reviewers familiar with `docs/timeline-editor-prd.md`, this PRD is a near-line-for-line translation. The substitution table:

| Timeline | Image Editor |
| --- | --- |
| `TimelineSequence` | `ImageDocument` |
| `TimelineTrack` | `Artboard` (optional, multi-artboard reserved) and layer groups (existing) |
| `TimelineClip` | `Layer` (extended with `LayerWorkflowBinding`) |
| `ClipVersion` | `LayerVersion` |
| `run_mode = "clip"` | `run_mode = "layer"` |
| `run_mode = "sequence"` (reserved) | `run_mode = "image"` (reserved) |
| `dependencyHash` | `dependencyHash` (same function) |
| `currentAssetId` | `Layer.data` data URL + `imageReference.uri` asset ref |
| `selectedOutputNodeId` (must be media output) | `selectedOutputNodeId` (must be `ImageOutputNode` or `MaskOutputNode`) |
| `WorkflowRunner.run(workflow, paramOverrides)` | unchanged |
| `GlobalWebSocketManager` job subscriptions | unchanged |
| `TimelineGenerationStore` | `SketchGenerationStore` |
| `SelectedClipNodeStore` | `SelectedLayerNodeStore` |
| `GeneratedClipPanel` | `GeneratedLayerPanel` |
| `NodeStack` | `LayerNodeStack` |
| `timeline-template` tag | `image-template` tag |
| `/timeline/:sequenceId` | `/sketch/:documentId` |
| `?from=timeline:{sequenceId}:{clipId}` | `?from=sketch:{documentId}:{layerId}` |
| `timeline_sequence` table | `image_document` table |
| `packages/timeline/` | `packages/image-editor/` |
| Slice 3 export (compile to ffmpeg graph) | Future slice (compile to image-op graph) |

Anywhere this PRD is silent, the Timeline PRD's decisions apply.

## Appendix B — Why this approach

A few places this PRD makes a call worth flagging:

- **Layers as workflow-backed first-class objects, not a separate "smart layer" overlay**, because that is exactly the choice the Timeline made for clips, and the choice has been validated by tRPC, dependency-hash, version-pruning, and round-trip code that already exists in production. Re-implementing the same pattern with different names (e.g. "smart object", "AI layer") would split future maintenance.
- **Reuse the sketch-editor-rc canvas wholesale rather than adopting a different image library**, because the branch already shipped 88k lines including WebGPU compositing, 12 blend modes, the full effects chain, and 94 tests. Replacing it would be the most expensive single thing the team could do, for no user benefit.
- **`run_mode = "layer"` instead of generalising to `"embedded"`**, because the Timeline already hard-codes `"clip"` in queries and lifecycle code; following the same precedent (one run-mode per host editor) keeps the listing/filter logic boringly explicit. If a third editor ever embeds workflows, we generalise then.
- **No per-layer separate canvas thumbnails store**, because the existing `Layer.data` PNG data URL already serves as a thumbnail when downsampled in the layers panel. Adding a parallel thumbnail asset only matters once layers go above 1 MB, at which point we externalise the layer to an asset anyway (§12).
- **Inpaint-Here is a Slice 2 feature, not Slice 3**, because it is the headline user value of the editor and costs maybe a day on top of the other Slice 2 work. Pushing it to a later slice would dilute the launch.

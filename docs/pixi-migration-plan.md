# Pixi Layout Canvas Migration Plan

## Goal

Deliver a Pixi.js v8-only canvas editor with the MVP feature set defined below, then layer V2 capabilities without
reimplementing Pixi-provided geometry, bounds, or event handling.

## Scope (checklist)

### Must have (MVP)

- [x] Canvas pan/zoom (existing LayoutCanvasEditor controls)
- [x] Create: rectangle, ellipse, line, text, image (toolbar + element types)
- [x] Select, move (Pixi pointer events wired)
- [ ] Resize, rotate (handles rendering done; interaction wiring pending)
- [x] Multi-select with shift/cmd (selection logic in store + Pixi events)
- [x] Layers panel with hierarchy (existing panel)
- [x] Properties panel (fill, stroke, opacity, size, position)
- [x] Undo/redo (existing history in LayoutCanvasStore)
- [x] Export PNG (Pixi export pipeline)
- [x] Save/load documents (existing document store serialization)

### Should have (V2)

- [ ] Groups and frames (group rendering exists; interaction parity pending)
- [ ] Boolean operations
- [ ] Align/distribute tools (UI exists; Pixi parity pending)
- [ ] Smart guides and snapping (snap guides render; Pixi drag parity pending)
- [ ] Components/symbols
- [ ] Text styling (basic text; advanced styling pending)
- [ ] Image filters (blur/shadow pending)
- [ ] Keyboard shortcuts (basic shortcuts exist; tool-specific pending)
- [x] Grid and rulers (grid rendering exists)
- [ ] Basic vector editing

### Won't have (out of scope)

- [ ] Real-time multiplayer
- [ ] Auto-layout
- [ ] Prototyping/interactions
- [ ] Plugins/extensions
- [ ] Version history
- [ ] Comments/annotations
- [ ] Dev mode/code export

## Mini report

**Done**

- Pixi-only renderer (Konva removed from layout canvas path)
- Selection/multi-select + drag move
- Selection outline + resize/rotation handles (with 15° snap)
- Pixi hit testing via bounds
- PNG export routed through Pixi renderer
- Perf harness overlay for 1k/5k/10k datasets

**Todo**

- Snap index + snapping behavior (guides already rendering)
- Tool architecture + tool manager
- Spatial index (R-tree/quadtree) for large scenes
- Adaptive grid spacing by zoom
- SVG export pipeline

**Open questions**

- Which spatial index library to standardize on (or custom R-tree)?
- Snap threshold defaults and keyboard toggle UX

## Architecture (target)

```
src/
├── core/
│   ├── document/
│   │   ├── DocumentModel.ts
│   │   ├── Element.ts
│   │   ├── elements/
│   │   └── history/
│   ├── renderer/
│   │   ├── CanvasRenderer.ts
│   │   └── PixiRenderer.ts
│   └── tools/
│       ├── Tool.ts
│       ├── SelectTool.ts
│       ├── RectTool.ts
│       ├── EllipseTool.ts
│       └── TextTool.ts
├── state/
│   ├── documentStore.ts
│   ├── canvasStore.ts
│   └── toolStore.ts
├── components/
│   ├── Canvas/
│   │   ├── CanvasViewport.tsx
│   │   └── CanvasHUD.tsx
│   ├── Toolbar/
│   │   └── Toolbar.tsx
│   ├── Panels/
│   │   ├── LayersPanel.tsx
│   │   └── PropertiesPanel.tsx
│   └── App.tsx
└── utils/
    ├── spatial/
    ├── snapping/
    └── export/
```

## Phase 1 — Foundation (checklist)

- [x] Document model (LayoutCanvasStore elements + serialization)
- [x] Element interface (id/type/x/y/width/height/rotation/opacity/visible/locked)
- [x] Concrete elements (Rect/Ellipse/Line/Text/Image)
- [x] State management (Zustand stores)
- [x] Granular selectors (no full-store subscriptions)
- [x] History system (undo/redo, batched updates)

## Phase 2 — Renderer (checklist)

- [x] PixiRenderer implements CanvasRenderer
- [x] Mount/resize/destroy lifecycle
- [x] Camera system (pan/zoom)
- [x] Element rendering (Rect/Ellipse/Line/Text/Image)
- [x] Selection rendering (bounds + outline + handles)
- [x] Grid rendering
- [x] Selection handle interactions (resize + rotation handle wired, rotation snap done)

## Phase 3 — Tools & Interaction (checklist)

- [ ] Tool architecture (Tool interface + manager)
- [x] Select tool (click/multi-select + drag move)
- [x] Resize/rotate via handles (resize + rotation handle wired, rotation snap done)
- [x] Creation tools (Rect/Ellipse/Line/Text/Image)
- [x] Hit testing (Pixi getBounds-based hit test in renderer; spatial index deferred)
- [~] Snapping (guides rendering wired; snap index pending)

✅ **Milestone achieved:** Pixi selection + drag wired through Pixi pointer events (no Konva).

## Phase 2 — Snap & Grid

1. **Snap Manager**
   - [~] Snap to grid, canvas edges/center, object edges/centers (snap index pending)
   - [x] Guide overlay rendering via Pixi Graphics
2. **Grid Renderer**
   - [x] Cached grid drawing (Graphics or TilingSprite)
   - [ ] Adaptive spacing by zoom level

## Phase 3 — History & Serialization

1. **History Manager**
   - [x] Command pattern with deltas (Zustand history)
   - [x] Batch operations per gesture
2. **Serialization**
   - [x] JSON export/import for layout canvas
   - [x] PNG export pipeline
   - [ ] SVG export pipeline

## Phase 4 — Performance & Utilities

1. **Spatial Index**
   - [ ] R-tree or quadtree for snap/selection queries
2. **Culling & Pooling**
   - [ ] Viewport culling
   - [ ] Reuse Graphics and Sprite instances
3. **Performance Harness**
   - [x] FPS/latency overlay for 1k/5k/10k elements

## Directory Structure

```
web/src/components/design/renderers/pixi/
├── PixiRenderer.ts
├── pixiUtils.ts
├── pixiSnap.ts
├── pixiSelection.ts
├── pixiDrag.ts
├── pixiTransform.ts
└── pixiSpatial.ts
```

## Completion Criteria

- Selection, drag, transform, snap, and export match current behavior.
- 60 fps at ~1–2k elements, ≥30 fps at 10k elements.
- No Konva/React-Konva dependencies in web package.

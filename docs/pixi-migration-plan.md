# Pixi Layout Canvas Migration Plan

## Goal

Deliver a Pixi.js v8-only canvas editor with the MVP feature set defined below, then layer V2 capabilities without
reimplementing Pixi-provided geometry, bounds, or event handling.

## Scope

### Must have (MVP)

- Canvas pan/zoom
- Create: rectangle, ellipse, line, text, image
- Select, move, resize, rotate
- Multi-select with shift/cmd
- Layers panel with hierarchy
- Properties panel (fill, stroke, opacity, size, position)
- Undo/redo
- Export PNG
- Save/load documents

### Should have (V2)

- Groups and frames
- Boolean operations
- Align/distribute tools
- Smart guides and snapping
- Components/symbols
- Text styling
- Image filters
- Keyboard shortcuts
- Grid and rulers
- Basic vector editing

### Won't have (out of scope)

- Real-time multiplayer
- Auto-layout
- Prototyping/interactions
- Plugins/extensions
- Version history
- Comments/annotations
- Dev mode/code export

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

## Phase 1 — Foundation

1. **Document model**
   - Element interface: id, type, x, y, width, height, rotation, opacity, visible, locked
   - Concrete elements: Rect, Ellipse, Line, Text, Image
   - DocumentModel with add/remove/update + JSON serialize/deserialize
2. **State management**
   - Zustand stores for document, canvas, tool state
   - Granular selectors; no full-store subscriptions
3. **History system**
   - Undo/redo with immer patches
   - Batch operations per gesture
   - Max history depth (100)

## Phase 2 — Renderer

1. **Pixi setup**
   - PixiRenderer implements CanvasRenderer
   - Mount/resize/destroy lifecycle
2. **Camera system**
   - Pan via container position
   - Zoom via container scale
3. **Element rendering**
   - Rect → Graphics.rect()
   - Ellipse → Graphics.ellipse()
   - Line → moveTo/lineTo + stroke()
   - Text → Text
   - Image → Sprite
4. **Selection rendering**
   - Use `DisplayObject.getBounds()` and `Rectangle.enlarge()` for bounds
   - Render selection box + handles via Graphics.rect()
5. **Grid rendering**
   - TilingSprite-based grid

## Phase 3 — Tools & Interaction

1. **Tool architecture**
   - Base Tool interface with pointer events
   - Tool manager for active tool
2. **Select tool**
   - Click/multi-select (shift/cmd)
   - Drag to move
   - Resize/rotate via handles
3. **Creation tools**
   - Rect, Ellipse, Line, Text, Image
4. **Hit testing**
   - R-tree spatial index for large scenes
5. **Snapping**
   - Snap index with grid/canvas/element edges

✅ **Milestone achieved:** Pixi selection + drag wired through Pixi pointer events (no Konva).

## Phase 2 — Snap & Grid

1. **Snap Manager**
   - Snap to grid, canvas edges/center, object edges/centers
   - Guide overlay rendering via Pixi Graphics
2. **Grid Renderer**
   - Cached grid drawing (Graphics or TilingSprite)
   - Adaptive spacing by zoom level

## Phase 3 — History & Serialization

1. **History Manager**
   - Command pattern with deltas
   - Batch operations per gesture
2. **Serialization**
   - JSON export/import for layout canvas
   - PNG/SVG export pipeline

## Phase 4 — Performance & Utilities

1. **Spatial Index**
   - R-tree or quadtree for snap/selection queries
2. **Culling & Pooling**
   - Viewport culling
   - Reuse Graphics and Sprite instances
3. **Performance Harness**
   - FPS/latency overlay for 1k/5k/10k elements

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

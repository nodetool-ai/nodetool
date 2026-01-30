# Pixi Layout Canvas Migration Plan

## Goal

Replace Konva-driven layout canvas interactions with Pixi.js v8 rendering and interaction tooling, while preserving
feature parity for selection, transforms, snapping, and export.

## Current State

- Pixi renders all layout elements (rect, ellipse, line, text, image, group outline).
- Konva has been removed from the web package and is no longer used by the layout canvas.

## Phase 1 — Interaction Foundations

1. **Selection Manager**
   - Click selection with modifier keys
   - Marquee selection (box drag)
   - Multi-select bounds calculation
2. **Drag Manager**
   - Single and multi-object dragging
   - Axis constraints (shift key)
   - Respect lock/visibility state
3. **Transform Handles**
   - 8 resize handles + rotate handle
   - Maintain aspect ratio with shift
   - Rotation snapping to 15° increments

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

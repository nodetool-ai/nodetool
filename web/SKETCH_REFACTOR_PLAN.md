# Sketch Refactor Plan

## Goal

Refactor the sketch editor so responsibilities are clearer and future changes are safer, without removing existing behavior.

Primary files:

- `web/src/components/sketch/SketchEditor.tsx`
- `web/src/components/sketch/SketchCanvas.tsx`
- `web/src/components/sketch/SketchToolbar.tsx`
- `web/src/components/sketch/SketchLayersPanel.tsx`
- `web/src/components/sketch/SketchCanvasContextMenu.tsx`

## Refactor Direction

- `SketchEditor` should stay the composition root, but not hold every store selector and action handler directly.
- `SketchCanvas` should focus on rendering, pointer interaction, and imperative canvas operations.
- `SketchToolbar` and `SketchCanvasContextMenu` should share the same tool and action definitions instead of duplicating behavior.
- `SketchLayersPanel` should remain mostly a presentation component with local UI state, while shared layer commands live elsewhere.

## Checklist

- [x] Extract focused controller hooks from `SketchEditor` for:
  - store selection
  - history actions
  - layer actions
  - canvas actions
  - color actions

- [x] Reduce `SketchEditor` to orchestration and component wiring only.

- [x] Create shared tool/action definitions used by both:
  - `SketchToolbar.tsx`
  - `SketchCanvasContextMenu.tsx`

- [x] Move duplicated tool metadata and quick-action behavior into shared helpers/config.

- [ ] Split `SketchCanvas` into smaller units by concern:
  - compositing and redraw
  - imperative canvas methods
  - overlay and cursor rendering
  - pointer handling by tool group

- [x] Keep `SketchCanvas` behavior unchanged during the first pass.

- [x] Extract reusable localStorage-backed section persistence into a shared hook for:
  - toolbar collapsed sections
  - layers panel collapsed sections

- [x] Keep local UI-only state inside panels, including:
  - layer rename state
  - drag/drop state
  - adjustment slider state

- [x] Move shared layer mutation logic behind reusable editor/layer action adapters.

- [x] Refactor in this order to minimize regressions:
  - extract pure helpers/config first
  - extract shared hooks/adapters next
  - simplify component bodies last

- [x] Verify existing behavior still works after refactor:
  - tool switching
  - keyboard shortcuts
  - undo/redo
  - layer operations
  - context menu actions
  - color updates
  - zoom/pan
  - crop/select/gradient interactions

## Expected Result

- Adding or changing a tool should require one shared definition, not multiple UI-specific updates.
- `SketchEditor` should become easier to read and maintain.
- `SketchCanvas` should be easier to reason about and test.
- Toolbar, layers panel, and context menu should become thinner and more predictable.

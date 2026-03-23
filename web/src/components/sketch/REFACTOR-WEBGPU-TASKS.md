# WebGPU Refactor Plan

## Goal

- keep `SketchDocument` and `Layer.data` stable
- keep editor, autosave, export, and node preview flow working
- move rendering to `WebGPU`
- use Canvas2D only as temporary migration scaffolding

## Decisions

- WebGPU is the only intended end state
- layer content is GPU-first during editing
- `Layer.data` is for persistence/history/export, not live rendering
- runtime owns device, context, resize, cleanup, and readback
- stay close to target, do not overengineer

## Phase 1: Runtime seam

- [x] add `rendering/` under sketch
- [x] define minimal runtime API: redraw, dirty redraw, layer lookup, snapshot, flatten, mask export
- [x] refactor `SketchCanvas.tsx` to use the runtime seam
- [x] keep `SketchCanvasRef` working for `useCanvasActions.ts` and node export
- [x] hide existing Canvas2D behind one legacy implementation

Done when:

- [x] drawing/export behavior unchanged
- [x] Canvas2D code no longer spread across the canvas component

## Phase 2: WebGPU compositing

- [x] init WebGPU, configure presentation surface
- [x] runtime-owned layer textures/resources
- [x] checkerboard background
- [x] layer compositing with opacity and blend modes
- [x] dirty/full redraw scheduling
- [x] upload/readback helpers
- [x] upload dirty regions from legacy raster path

Done when:

- [x] editor display rendered by WebGPU
- [x] layer order, isolate, opacity, blend modes match current
- [x] flatten/mask export still work

## Phase 3: Tool/runtime split

- [x] extract tool routing from `usePointerHandlers.ts`
- [x] define tool ops: stroke, erase, shape, gradient, color pick, flood fill
- [x] stop calling Canvas2D utils directly from pointer flow
- [x] legacy drawing behind helper adapters
- [x] runtime requests for hit testing and sampling
- [x] selection/pan/zoom/modifiers unchanged

Done when:

- [x] pointer handler is orchestration, not renderer code
- [x] one tool replaceable without rewriting the whole pipeline
- [x] history/autosave unchanged

## Phase 4: Common paint tools on WebGPU

- [ ] consolidate live stroke preview into one shared stroke-session path
- [ ] keep overlay/cursor/live stroke preview on 2D
- [ ] fix moved-layer then draw wiping preexisting layer content
- [ ] keep brush commit path stable while preview stays off WebGPU
- [ ] unify eraser preview with the same preview compositor model
- [ ] pencil commit path on WebGPU
- [ ] basic shape commit on WebGPU
- [ ] stroke-end snapshot for GPU-authored layers
- [ ] undo/redo boundaries intact

Legacy helpers still allowed: flood fill, blur, clone stamp, adjustments, crop, selection masking

Done when:

- [ ] live brush/eraser preview is stable and does not depend on WebGPU stroke compositing
- [ ] moved layers keep existing pixels when drawing resumes
- [ ] committed brush/pencil/eraser/shapes behave correctly with WebGPU display
- [ ] stroke end still updates `Layer.data`
- [ ] node preview still works

## Phase 5: Hard tools

- [ ] port or isolate flood fill
- [ ] port or isolate clone stamp
- [ ] port or isolate blur
- [ ] port or isolate adjustments
- [ ] rework alpha-lock and dirty-region behavior
- [ ] rework eyedropper, move auto-pick, clone-stamp sampling
- [ ] transform-aware reconciliation
- [ ] remove remaining Canvas2D runtime dependency from normal use

Done when:

- [ ] shipped tools work without old runtime
- [ ] leftover CPU helpers small and explicit

## Phase 6: Cleanup

- [ ] centralize snapshot/export
- [ ] reduce readback/encoding work
- [ ] keep flatten/mask export stable
- [ ] delete dead Canvas2D files and adapters
- [ ] delete temporary migration code
- [ ] update docs

Done when:

- [ ] WebGPU is the renderer
- [ ] autosave/export work
- [ ] old Canvas2D runtime gone or tiny helpers only

## Execution Order

- [ ] Phase 1 → Phase 2 → smoke-test compositing/export/preview
- [ ] Phase 3 → Phase 4 → smoke-test paint tools
- [ ] Phase 5 → smoke-test hard tools
- [ ] Phase 6

## Optional

- [ ] profiling checkpoints
- [ ] document color/alpha rules if needed
- [ ] decide overlays stay 2D longer
- [ ] decide rare helpers stay CPU permanently
- [ ] visual regression tests if needed

# WebGPU Refactor Plan

## Goal

- keep `SketchDocument` and `Layer.data` stable for history, autosave, export, and node preview
- keep committed document rendering on `WebGPU`
- allow CPU/Canvas2D helpers only where they are explicit, correct, and still justified
- keep the shared transform-aware layer model as the long-term target

## Scope

- this file stays focused on the technical rendering/paint-architecture work
- broader feature ideas, parked ideas, and non-WebGPU product backlog belong in `SKETCH_FEATURES.md`

## Current Priorities

- [ ] eliminate the remaining transformed-layer regressions and add focused regression coverage for move/nudge/draw/export/autosave roundtrips
- [ ] centralize document-space ↔ layer-space coordinate mapping so preview, commit, hit testing, and helper tools all follow the same rules
- [ ] make active-layer preview and final commit obey the same transformed-layer semantics
- [ ] route flood fill, clone stamp, blur, and adjustments through shared session boundaries even when their internal implementation stays CPU-backed
- [ ] remove the remaining implicit legacy-runtime behavior from normal editing flow and replace it with explicit documented exceptions

## Important Follow-Up

- [ ] rework alpha-lock and dirty-region behavior so it fits the shared session plus the remaining helper tools
- [ ] rework eyedropper, move auto-pick, and clone-stamp sampling for transformed layers
- [ ] finish transform-aware rules for the remaining hard tools instead of letting them drift into one-off logic
- [ ] decide blur/adjustments backend from profiling and correctness, not from a blanket “everything must be GPU” rule
- [ ] add smoke/regression checks that specifically cover paint-after-move, preview correctness, and `Layer.data` sync timing

## Cleanup Later

- [ ] centralize snapshot/export/readback flow
- [ ] reduce unnecessary encoding and readback work
- [ ] delete dead Canvas2D adapters and temporary migration code
- [ ] keep flatten/mask export stable while cleanup happens
- [ ] update docs once the remaining helper-tool boundaries are final

## Stretch Goals

- [ ] move blur and/or adjustments to GPU if profiling clearly shows the gain is worth the complexity
- [ ] add visual regression checks if manual smoke tests stop being sufficient
- [ ] document color/alpha rules more formally if they remain a recurring source of regressions

## Completed Foundation

- [x] Phase 1: runtime seam (`rendering/`, runtime API, `SketchCanvasRef` compatibility, Canvas2D hidden behind one implementation)
- [x] Phase 2: WebGPU compositing (surface init, layer resources, checkerboard, opacity/blend compositing, dirty/full redraw scheduling, upload/readback helpers)
- [x] Phase 3: tool/runtime split (tool routing extracted from `usePointerHandlers.ts`, runtime-facing tool ops, legacy drawing moved behind helpers)
- [x] Phase 4: shared paint architecture foundation (`PaintSession`, shared `PaintEngine` model, persistent transformed layers, shared paint path for brush/pencil/eraser/basic shapes)

## Guardrails

- do not reintroduce baking transforms into pixels as the default long-term behavior
- do not mark a tool “done” while its main logic still lives in ad hoc pointer-handler code
- keep overlay, cursor, and live preview on 2D unless profiling proves a GPU move is clearly worth it
- correctness and transformed-layer semantics matter more than maximizing the amount of code that happens to run on WebGPU

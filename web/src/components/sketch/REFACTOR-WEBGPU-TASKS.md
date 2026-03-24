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

## Phase 4: Shared Paint Architecture

Phase 4 is not a request for more local fixes to `brush`, `pencil`, `eraser`, or shapes in isolation. The goal is one shared, transform-aware paint architecture that all common drawing tools use, with persistent transformed layers as the target model. Do not steer this phase toward baking transforms into pixels as the long-term solution, and do not introduce new tool-specific preview/composite paths.

`WebGPU` remains the renderer for committed document content, but live interaction state is allowed to stay on `2D` if that keeps behavior correct and the performance is already good. Cursor, selection, shape preview, and live stroke preview should stay unified under one preview model. Correctness, shared architecture, and transformed-layer semantics matter more here than maximizing the amount of code that happens to run on `WebGPU`.

While doing this, introduce the core seams for a more extensible brush engine later. That does not mean building programmable brushes now; it means structuring the shared paint session so input sampling, transform mapping, brush evaluation, preview composition, and commit can evolve independently. `brush`, `pencil`, and `eraser` should move toward being different engines/modes inside the same session model rather than permanently separate pipelines.

Current status: `painting/PaintSession.ts` is the primary execution path for brush/pencil/eraser. `BrushTool`, `PencilTool`, `EraserTool`, and `ShapeTool` route through the shared `PaintSession` and `PaintEngine` architecture. `usePointerHandlers.ts` delegates to `getToolHandler()` for these tools. Only blur and clone stamp still use inline paths (Phase 5). `useCompositing.ts` still special-cases active strokes for WebGPU preview.

Implementation guardrails:

- `PaintSession` must become the primary execution path for brush/pencil/eraser/basic shape commit in the live editor, not just parallel scaffolding.
- Do not mark a tool complete while its main logic still lives in `usePointerHandlers.ts`.
- Do not mark preview complete unless brush and eraser both preview correctly during drag.
- Do not mark transformed-layer work complete unless moved-layer-then-draw preserves existing pixels.

- [x] define one shared transform-aware paint/stroke session model
- [x] keep persistent transformed layers as the target model in code, not just in plan text
- [ ] centralize document-space ↔ layer-space coordinate mapping
- [x] separate input sampling/session lifecycle from brush evaluation/rendering
- [ ] use one shared live preview compositor for brush/pencil/eraser/shapes
- [x] keep overlay/cursor/live preview on 2D by default
- [x] make moved layers paint correctly without wiping existing pixels
- [ ] make active-layer preview/commit use the same transformed-layer rules
- [x] port brush onto the shared paint session
- [x] port pencil onto the shared paint session
- [x] port eraser onto the shared paint session
- [x] port basic shape commit onto the shared paint session
- [x] preserve undo/redo boundaries and stroke-end snapshot behavior through the shared session
- [x] keep `Layer.data` / export / node preview flow unchanged through the shared session migration
- [ ] leave room for future extensible/programmatic brush definitions without changing the session contract

Temporary migration allowance: flood fill, blur, clone stamp, adjustments, crop, and selection masking may remain CPU/Canvas2D-backed until the shared paint architecture is stable.

End goal: committed document rendering stays on `WebGPU`, while tool internals may stay CPU-backed where that remains simpler, correct, and fast enough. Those tools should still plug into the shared transform-aware paint/session model rather than keep ad hoc per-tool rendering paths.

Done when:

- [x] brush/pencil/eraser/shapes all use the shared transform-aware paint session
- [x] live preview is stable on the shared 2D preview path for brush and eraser
- [x] transformed layers stay persistent while painting/editing
- [x] moved layers keep existing pixels when drawing resumes
- [x] overlay/cursor/live preview remain on 2D unless profiling justifies a move
- [ ] committed brush/pencil/eraser/shapes behave correctly with WebGPU display
- [x] stroke end still updates `Layer.data`
- [x] node preview still works

Acceptance checks:

- [x] Brush preview visible during drag.
- [x] Eraser preview visible during drag without hiding the active layer.
- [x] Moving a layer and drawing again does not wipe preexisting content.
- Main paint flow no longer depends on tool-specific execution in `usePointerHandlers.ts`.

## Phase 5: Hard Tools And Explicit Exceptions

- [ ] keep flood fill as an explicit CPU-backed helper unless profiling later proves otherwise
- [ ] keep clone stamp as an explicit CPU-backed helper unless profiling later proves otherwise
- [ ] target blur as an explicit GPU-backed tool
- [ ] target adjustments as explicit GPU-backed tools
- [ ] route flood fill / clone stamp through the shared transform-aware session boundaries where needed
- [ ] route blur / adjustments through the shared transform-aware session boundaries where needed
- [ ] rework alpha-lock and dirty-region behavior for the shared session and remaining helpers
- [ ] rework eyedropper, move auto-pick, and clone-stamp sampling for transformed layers
- [ ] finish transform-aware reconciliation rules for remaining hard tools
- [ ] remove hidden ad hoc Canvas2D dependencies from normal editing flow
- [ ] document remaining CPU helpers as intentional exceptions

Done when:

- [ ] blur and adjustments work as explicit GPU-backed tools
- [ ] flood fill and clone stamp work as explicit documented CPU-helper paths
- [ ] shipped tools work through the shared architecture or explicit documented CPU-helper paths
- [ ] remaining CPU helpers are small, explicit, and justified
- [ ] normal editing no longer relies on implicit legacy-runtime behavior

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

- [x] Phase 1 → Phase 2 → smoke-test compositing/export/preview
- [x] Phase 3 → Phase 4 → smoke-test paint tools
- [ ] Phase 5 → smoke-test hard tools
- [ ] Phase 6

## Optional

- [ ] profiling checkpoints
- [ ] document color/alpha rules if needed
- [ ] decide overlays stay 2D longer
- [ ] decide rare helpers stay CPU permanently
- [ ] visual regression tests if needed

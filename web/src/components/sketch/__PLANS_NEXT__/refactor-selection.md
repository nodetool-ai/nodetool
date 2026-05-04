# Selection + compositor refactor

Move selection masking fully onto the GPU. Eliminate the two CPU hot paths — `clipContextToSelectionMask` (pixel scan every `pointermove`) and `applySelectionMaskAlpha` (full canvas readback every stroke end). WebGPU only, no Canvas2D fallback, no selection persistence across reloads.

---

## Architecture

**Extend `WebGPURuntime`** — layer textures, ping-pong FBOs, blend pipelines, and dirty tracking already exist. The work is:

1. Add an `r8unorm` mask texture (doc dimensions) derived lazily from the CPU `Uint8ClampedArray`.
2. Add two new WGSL shaders + pipelines to `shaders.ts` / `WebGPURuntime`: ants overlay and brush mask multiply.
3. Remove all CPU clipping and feather readback from the paint pipeline.

**Undo contract:** CPU `Selection.data` (`Uint8ClampedArray`) stays canonical. GPU texture is a derived view, re-uploaded when `maskDirty`. Undo restores the CPU array → sets `maskDirty` → next composite re-uploads. No GPU readback needed for undo.

**Selection is not persisted** — cleared on reload, no `sketch_data` serialization.

**Brush strategy (important):** Phase 3 does *not* rewrite the brush engine to native GPU stamps — that is a separate future project. Instead: keep CPU stroke generation as-is, and after the stroke buffer is built, run a GPU mask-multiply pass on the uploaded texture (same mechanism as Phase 4's feather blit). This eliminates `clipContextToSelectionMask` without touching brush logic.

**Coordinate contract (pin before writing shaders):** All mask-sampling shaders use the same doc-space UV formula: `uv = (fragDocPos - vec2(originX, originY)) / vec2(maskWidth, maskHeight)`. Pass `originX`, `originY`, `maskWidth`, `maskHeight` as uniforms in every mask-sampling pipeline. Clamp to `[0,1]` and treat out-of-bounds as fully selected (mask = 1.0) so tools work outside the mask bounds.

---

## Migration table

| Callsite | Purpose | Phase |
|----------|---------|-------|
| `selectionMask.ts`: `clipContextToSelectionMask` | CPU clip scan on every move | 3 |
| `selectionMask.ts`: `applySelectionMaskAlpha` | Full canvas readback + pixel multiply | 4 |
| `selectionMask.ts`: `buildSelectionMaskOutlinePath` | Edge-scan → Path2D | 2 |
| `selectionMask.ts`: `drawSelectionOutlinePath` | Stroke Path2D with dashes | 2 |
| `selectionMask.ts`: `drawStrokeBufferForDisplayWithSelectionFeather` (line 1378) | Feather preview — calls `applySelectionMaskAlpha` | 4 |
| `selectionMask.ts`: `getOrRebuildSelectionOutlinePath` + `SelectionOutlinePathCacheScratch` | Path2D cache | 2 |
| `useOverlayRenderer.ts`: `setInterval` ants loop (line 338) + `antsPhaseRef` + path stroke | Marching ants animation | 2 |
| `useOverlayRenderer.ts`: `outlinePathScratchRef` | Path2D cache ref | 2 |
| `PaintSession.ts`: `clipSelectionForOffset` (lines 268, 335, 472) | Per-move clip in begin/move/end | 3 |
| `PaintSession.ts`: `applySelectionMaskAlpha` (lines 536–541, 618–625) | Post-stroke feather in deferred commit + `flushShiftBuffer` | 4 |
| `HelperToolSession.ts`: `clipSelectionForOffset` (lines 181, 241) | Symmetry/mirror clip | 3 |
| `WebGPURuntime.ts`: `strokeMaskScratchCanvas` (line 123) | CPU scratch for preview feather | 4 |
| `WebGPURuntime.ts`: `uploadStrokeMergePreview()` — calls `drawStrokeBufferForDisplayWithSelectionFeather` (line ~610) | Feather during stroke preview | 4 |
| `canvas2d/composite.ts:229` — calls `drawStrokeBufferForDisplayWithSelectionFeather` | Canvas2D feather preview | 4 |
| `usePointerHandlerUtils.ts`: `clipSelectionForOffset` function (line 273) | Wrapper — unused after Phase 3 | 3 |
| `usePointerHandlers.ts`: `clipSelectionForOffset` (lines 309, 409) | Destructured into tool dispatch | 3 |
| `tools/types.ts:156`: `clipSelectionForOffset` in `ToolContext` type | Type contract | 3 |
| `tools/buildToolContext.ts:119,198`: `clipSelectionForOffset` wiring | Context builder | 3 |
| `ShapeTool.ts:229`: `ctx.clipSelectionForOffset` | Shape clip | 5 |
| `__tests__/*.test.ts`: `clipSelectionForOffset: jest.fn()` mocks (~10 files) | Stale mocks after type removal | 6 |

---

## Phases

### Phase 1 — Mask texture upload

- [ ] Add to `WebGPURuntime`: `maskTexture: GPUTexture | null` (`r8unorm`, doc dimensions), `maskDirty = false`.
- [ ] Implement `uploadMaskTexture()`: writes `Selection.data` (`Uint8ClampedArray`) to `maskTexture` via `device.queue.writeTexture`. Create/recreate texture when dimensions change.
- [ ] Call `uploadMaskTexture()` at the top of the composite pass when `maskDirty`, then clear the flag.
- [ ] After any selection mutation (all selection tools, invert, feather, combine ops), set `maskDirty = true` and call `DisplayFrameCoordinator.scheduleRaf()`.
- [ ] Add `originX/Y` uniforms alongside existing layer transform uniforms — needed in all mask-sampling shaders.
- [ ] Verify: change selection → next composite uploads correctly (console log or debugLabel).

### Phase 2 — Ants shader (validates texture pipeline before touching paint)

- [ ] Add `SELECTION_ANTS_FRAGMENT` to `shaders.ts`: fullscreen quad, samples `maskTexture` at doc-space UV, edge-detects neighbors, emits animated dashes via `phase: f32` uniform. Reuse `FULLSCREEN_QUAD_VERTEX`.
- [ ] Register `selectionAntsPipeline` in `WebGPURuntime` (alongside existing 5 pipelines). Add `drawSelectionAnts(phase: number)` method.
- [ ] In `useOverlayRenderer.ts`: remove the `setInterval` ants loop (line 338), `antsPhaseRef`, and all `Path2D` ants stroke calls. Call `WebGPURuntime.drawSelectionAnts(phase)` from the existing rAF-driven composite instead — drive phase from a ref incremented in the compositor. Ants will now animate at rAF cadence (~60fps) instead of 72ms (~14fps); intentional improvement.
- [ ] Delete from `selectionMask.ts`: `buildSelectionMaskOutlinePath`, `drawSelectionOutlinePath`, `getOrRebuildSelectionOutlinePath`, `SelectionOutlinePathCacheScratch`.
- [ ] Delete from `useOverlayRenderer.ts`: `outlinePathScratchRef`.
- [ ] Rect/ellipse/lasso live-preview outlines (not committed mask) stay CPU-drawn — they are not hot paths.
- [ ] Verify: ants render correctly at various zoom levels and with `originX/Y` offset.

### Phase 3 — Remove CPU clipping from paint session

CPU stroke buffer continues to build as-is (no stamp engine change). Clipping calls are removed; the mask is enforced at composite time in Phase 4. This phase is purely deletion — no new shader or pipeline.

- [ ] `PaintSession.ts` (`begin`, `move`, `end`): remove all three `clipSelectionForOffset` calls (lines 268, 335, 472).
- [ ] `HelperToolSession.ts`: remove `clipSelectionForOffset` calls (lines 181, 241).
- [ ] Remove `clipSelectionForOffset` from `usePointerHandlers.ts` (lines 309, 409). Delete the function from `usePointerHandlerUtils.ts`. Delete `clipContextToSelectionMask` from `selectionMask.ts`.
- [ ] Remove `clipSelectionForOffset` from `ToolContext` type (`tools/types.ts:156`) and from `buildToolContext.ts` (lines 119, 198).
- [ ] Note: brush/eraser will paint outside selection until Phase 4 adds the GPU mask multiply — expected on a dev branch.
- [ ] Verify: typecheck + lint clean; no runtime errors on brush stroke.

### Phase 4 — Post-stroke feather → GPU alpha multiply

- [ ] Add `MASK_MULTIPLY_BLIT_FRAGMENT` to `shaders.ts` (or extend existing blit): blits source texture to dest with `out.a *= textureSample(mask, uv)`. Used for stroke commit and live preview.
- [ ] `WebGPURuntime.uploadStrokeMergePreview()` (line ~610): replace `drawStrokeBufferForDisplayWithSelectionFeather` call with a GPU mask-multiply blit pass. Remove `strokeMaskScratchCanvas` (line 123).
- [ ] `canvas2d/composite.ts:229`: remove `drawStrokeBufferForDisplayWithSelectionFeather` call — Canvas2D path no longer needs selection feathering.
- [ ] `PaintSession.ts`: remove `applySelectionMaskAlpha` calls at lines 536–541 (deferred commit) and 618–625 (`flushShiftBuffer`). Feather is now applied by the GPU pass above.
- [ ] Delete `drawStrokeBufferForDisplayWithSelectionFeather` from `selectionMask.ts` (line 1378). Delete `applySelectionMaskAlpha` from `selectionMask.ts`.
- [ ] Verify: feathered selection matches prior output visually (pixel probe test at known coords, binary + feathered mask).

### Phase 5 — Remaining tools

- [ ] Pencil: same GPU mask-multiply pass in composite path as brush (Phase 4).
- [ ] Flood fill: writes directly to the layer canvas (not through PaintSession). Apply mask as a CPU multiply on the filled region before committing — same pattern as blur/clone dirty-rect multiply.
- [ ] Gradient fill: render gradient into staging FBO → GPU mask-multiply blit (reuse Phase 4 pass). No CPU canvas readback.
- [ ] Shape fill: same GPU blit approach.
- [ ] Remove remaining `clipSelectionForOffset` calls from `ShapeTool.ts:229` and gradient commit paths.
- [ ] Blur / clone: these are CPU-bound (`getImageData` / `putImageData`). Apply mask as a CPU multiply on the result buffer before `putImageData` — same pattern as the old `applySelectionMaskAlpha` but scoped to dirty rect only. Not a hot path (no per-move call); acceptable.
- [ ] Ctrl+C / cut: readback CPU `Selection.data` (already canonical) + GPU layer readback on copy action only — not a hot path, acceptable cost.

### Phase 6 — Cleanup

- [ ] Update `~10 test files` that mock `clipSelectionForOffset: jest.fn()` — remove the mock field now that it's gone from `ToolContext`. (`toolHandlers`, `shiftLineBufferReuse`, `sharedToolModules`, `helperToolSession`, `segmentation`, `samplingContract`, `previewSessionRegression`, `moveTransformUnification`, `phase2TransformLifecycle`, `phase1Fixes`, `phase1Enforcement`, `paintSession`.)
- [ ] Delete any remaining dead code from `selectionMask.ts` (audit all exports).
- [ ] Run `npm run typecheck` + `npm run lint` — fix all errors.
- [ ] Tests: mask parity (binary + feather pixel probes), ants visible at zoom extremes, brush/erase/gradient with selection.
- [ ] `npm run test` sketch suite green.

### Future (out of scope, keep in mind)

- [ ] **Selection serialization**: Persist active selection in `sketch_data` for project export / reload parity. CPU array is already canonical so serialization is trivial when needed.
- [ ] **Blur / clone GPU port**: Move `getImageData` / `putImageData` tools to GPU compute shaders if they become a measured bottleneck. No urgency — dirty-rect-scoped CPU multiply is fast enough at current canvas sizes.

**Note — GPU brush stamps: not recommended.** Lazy assist (stroke stabilization) and painterly effects (wet mixing, color bleed between stamps) both require per-stamp CPU access to stroke state and canvas readback. Moving stamp generation to GPU would block these. The CPU-generates / GPU-composites split is the right architecture; the hot paths this refactor eliminates were the actual problem.

---

## Acceptance

- [ ] No CPU mask scan in `pointermove` while painting.
- [ ] Feathered selections match prior `applySelectionMaskAlpha` output within tolerance.
- [ ] All paint tools (brush, eraser, pencil, blur, clone, gradient, shape, flood fill) respect active selection via GPU mask.
- [ ] Marching ants rendered via shader — no Path2D stroke in animation loop.
- [ ] Undo/redo of selection changes correct: CPU array restored → GPU re-uploads on next composite.
- [ ] `npm run test` green; manual smoke: brush/erase/gradient/wand with feathered selection.

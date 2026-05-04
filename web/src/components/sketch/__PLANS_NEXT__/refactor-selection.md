# Selection + compositor refactor

Move selection masking fully onto the GPU. Eliminate the two CPU hot paths — `clipContextToSelectionMask` (pixel scan every `pointermove`) and `applySelectionMaskAlpha` (full canvas readback every stroke end). WebGPU only, no Canvas2D fallback, no selection persistence across reloads.

---

## Architecture

**Extend `WebGPURuntime`** — layer textures, ping-pong FBOs, blend pipelines, and dirty tracking already exist. The work is:

1. Add an `r8unorm` mask texture (`Selection.width × Selection.height`) derived lazily from the CPU `Uint8ClampedArray`.
2. Add two new WGSL shaders + pipelines to `shaders.ts` / `WebGPURuntime`: ants overlay and mask-multiply blit.
3. Remove the two CPU hot paths: per-move clip scan and per-frame preview feather. Commit-time mask multiply stays CPU (once per stroke, not a hot path).

**Undo contract:** CPU `Selection.data` (`Uint8ClampedArray`) stays canonical. GPU texture is a derived view, re-uploaded when `maskDirty`. Undo restores the CPU array → sets `maskDirty` → next composite re-uploads. No GPU readback needed for undo.

**Selection is not persisted** — cleared on reload, no `sketch_data` serialization.

**Brush strategy (important):** Phase 3 does *not* rewrite the brush engine to native GPU stamps — that is a separate future project. Instead: keep CPU stroke generation as-is, and after the stroke buffer is built, run a GPU mask-multiply pass on the uploaded texture (same mechanism as Phase 4's feather blit). This eliminates `clipContextToSelectionMask` without touching brush logic.

**Coordinate contract (pin before writing shaders):** All mask-sampling shaders use the same doc-space UV formula: `uv = (fragDocPos - vec2(originX, originY)) / vec2(maskWidth, maskHeight)`. Pass `originX`, `originY`, `maskWidth`, `maskHeight` as uniforms in every mask-sampling pipeline. Out-of-bounds behavior and sampler filter differ by shader:
- **Mask-multiply (paint tools):** out-of-bounds → `1.0` (fully selected) so brush/fill work freely outside the canvas boundary. Sampler: `linear` — feathered masks are smooth gradients; nearest would produce a blocky edge.
- **Ants:** out-of-bounds → `0.0` (not selected) so the edge transition is visible when the selection reaches the canvas boundary; ants also render outside the canvas when selection extends beyond doc bounds. Sampler: `nearest` — edge detection requires a binary threshold, linear interpolation would blur the boundary.

---

## Migration table

| Callsite | Purpose | Phase |
|----------|---------|-------|
| `selectionMask.ts`: `clipContextToSelectionMask` | CPU clip scan on every move | 3 |
| `selectionMask.ts`: `applySelectionMaskAlpha` | Full canvas readback + pixel multiply — **keep**: still called by `PaintSession` at commit; delete only if commit path is later ported to GPU | — |
| `selectionMask.ts`: `buildSelectionMaskOutlinePath` | Edge-scan → Path2D | 2 |
| `selectionMask.ts`: `drawSelectionOutlinePath` | Stroke Path2D with dashes | 2 |
| `selectionMask.ts`: `drawStrokeBufferForDisplayWithSelectionFeather` (line 1378) | Feather preview — calls `applySelectionMaskAlpha` | 4 |
| `selectionMask.ts`: `getOrRebuildSelectionOutlinePath` + `SelectionOutlinePathCacheScratch` | Path2D cache | 2 |
| `useOverlayRenderer.ts`: `setInterval` ants loop (line 338) + `antsPhaseRef` + path stroke | Marching ants animation | 2 |
| `useOverlayRenderer.ts`: `outlinePathScratchRef` | Path2D cache ref | 2 |
| `useOverlayRenderer.ts`: `selectionMoveAntsRef` | Translates ants during live move drag — replaced by fresh `originX/Y` uniforms | 2 |
| `PaintSession.ts`: `clipSelectionForOffset` (lines 268, 335, 472) | Per-move clip in begin/move/end | 3 |
| `PaintSession.ts`: `applySelectionMaskAlpha` (lines 536–541, 618–625) | Post-stroke feather in deferred commit + `flushShiftBuffer` — **keep**: once per stroke, not a hot path; removing it would leave committed layer data unmasked | — |
| `HelperToolSession.ts`: `clipSelectionForOffset` (lines 181, 241) | Symmetry/mirror clip | 3 |
| `WebGPURuntime.ts`: `strokeMaskScratchCanvas` (line 123) | CPU scratch for preview feather | 4 |
| `WebGPURuntime.ts`: `uploadStrokeMergePreview()` — calls `drawStrokeBufferForDisplayWithSelectionFeather` (line ~610) | Feather during stroke preview | 4 |
| `canvas2d/composite.ts:229` — calls `drawStrokeBufferForDisplayWithSelectionFeather` | Canvas2D feather preview | 4 |
| `usePointerHandlerUtils.ts`: `clipSelectionForOffset` function (line 273) | Wrapper — unused after Phase 3 | 3 |
| `usePointerHandlers.ts`: `clipSelectionForOffset` (lines **316, 416**) | Destructured into tool dispatch | 3 |
| `tools/types.ts:156`: `clipSelectionForOffset` in `ToolContext` type | Type contract | 3 |
| `tools/buildToolContext.ts:119,198`: `clipSelectionForOffset` wiring | Context builder | 3 |
| `ShapeTool.ts:229`: `ctx.clipSelectionForOffset` | Shape clip | 5 |
| `__tests__/*.test.ts`: `clipSelectionForOffset: jest.fn()` mocks (**12 files**) | Stale mocks after type removal | 6 |

---

## Phases

### Phase 1 — Mask texture upload ✅

- [x] Add to `WebGPURuntime`: `maskTexture: GPUTexture | null` (`r8unorm`), `maskDirty = false`, `currentSelection: Selection | null`.
- [x] Implement `uploadMaskTexture()` with `bytesPerRow` padding to 256-byte alignment.
- [x] Call `uploadMaskTexture()` at top of composite pass when `maskDirty`, then clear the flag.
- [x] Add `setSelection(sel)` to `SketchRuntime` interface. `WebGPURuntime` sets `maskDirty = true` when `data` identity changes; clears `maskTexture` when `sel = null`. `Canvas2DRuntime` is a no-op.
- [x] Wire via `useEffect` in `useCanvasOrchestration`: `compositing.runtime.setSelection(selection ?? null)` when `selection` changes. Reads `currentSelection.originX/Y` fresh each composite (no caching).
- [x] Verify: typecheck passes (exit 0).

### Phase 2 — Ants shader (validates texture pipeline before touching paint)

**Coordinate note:** display canvas is rendered at doc resolution (doc pixel = canvas pixel); CSS zoom/pan handled externally. `uv * canvasSize` in WGSL IS doc-pixel coordinates. No viewport transform needed in the ants shader.

**Continuous animation:** `WebGPURuntime` exposes `onNeedsRedraw?: () => void`. Set from `useCanvasOrchestration` to `compositing.requestRedraw`. Called at end of `compositeToDisplay` when ants are active, driving 60fps rAF loop.

**Move-drag known regression (Phase 2b):** During a selection-move drag, `SelectTool` updates `selectionMoveAntsRef` (not the store). GPU ants will show original `originX/Y` until move is committed. Fix in Phase 2b below.

- [ ] Add `SELECTION_ANTS_FRAGMENT` to `shaders.ts`: `docPos = uv * canvasSize`, `maskCoord = floor(docPos - maskOrigin)`, 4-neighbor edge detect (out-of-bounds = 0), animated dashes via `phase: f32`. Reuse `FULLSCREEN_QUAD_VERTEX`. No sampler — use `textureLoad`.
- [ ] Add `selectionAntsPipeline` (6th pipeline) + `selectionAntsBindGroupLayout` to `WebGPURuntime`. Add `antsPhase: number = 0` and `onNeedsRedraw?: () => void` public fields. Add private `drawSelectionAnts(encoder, targetView, W, H)`.
- [ ] In `compositeToDisplay`: after the blit pass, if `maskTexture && currentSelection`, increment `antsPhase`, call `drawSelectionAnts` on swapChain view (`loadOp: "load"`), then call `onNeedsRedraw?.()`.
- [ ] Wire `onNeedsRedraw` in `useCanvasOrchestration`: `(compositing.runtime as {onNeedsRedraw?: () => void}).onNeedsRedraw = compositing.requestRedraw`.
- [ ] Delete from `useOverlayRenderer.ts`: `antsPhaseRef`, `outlinePathScratchRef`, `setInterval` ants loop (lines 330–349). Remove `createSelectionOutlinePathCacheScratch`, `drawSelectionOutlinePath`, `getOrRebuildSelectionOutlinePath`, `invalidateSelectionOutlinePathCache` from imports and all callsites. Remove `selectionMoveAntsRef` from `UseOverlayRendererParams` and hook internals.
- [ ] Delete from `selectionMask.ts`: `buildSelectionMaskOutlinePath`, `drawSelectionOutlinePath`, `getOrRebuildSelectionOutlinePath`, `SelectionOutlinePathCacheScratch`, `invalidateSelectionOutlinePathCache`.
- [ ] Rect/ellipse/lasso live-preview outlines (not committed mask) stay CPU-drawn — they are not hot paths.
- [ ] Verify: ants render correctly at various zoom levels; ants appear at canvas boundary; ants render outside canvas when selection extends beyond doc bounds.

### Phase 2b — Selection move drag with GPU ants

When a selection is being moved (`SelectTool.onMove`), the GPU ants must follow the drag before commit.

- [ ] Add `setSelectionOriginOverride(pos: {x:number;y:number} | null): void` to `WebGPURuntime` (not in interface). In `drawSelectionAnts`, use override instead of `currentSelection.originX/Y` when set.
- [ ] Add `setSelectionOriginOverride?` to `ToolContext` (optional). Wire in `buildToolContext` from params + `usePointerHandlerUtils` (via runtime duck-typed access).
- [ ] `SelectTool.onMove` (move-selection branch): call `ctx.setSelectionOriginOverride?.({ x: (start.originX??0)+dx, y: (start.originY??0)+dy })` instead of updating `selectionMoveAntsRef`.
- [ ] `SelectTool.onUp` (finalize move): call `ctx.setSelectionOriginOverride?.(null)` then `ctx.onSelectionChange(...)`.
- [ ] Remove `selectionMoveAntsRef` from `ToolContext`, `buildToolContext`, `useCanvasOrchestration`, `usePointerHandlers`, `SelectTool`. Remove `SelectionMoveAntsRef` type.

### Phase 3 — Remove CPU clipping from paint session

CPU stroke buffer continues to build as-is (no stamp engine change). Clipping calls are removed; the mask is enforced at composite time in Phase 4. This phase is purely deletion — no new shader or pipeline.

- [ ] `PaintSession.ts` (`begin`, `move`, `end`): remove all three `clipSelectionForOffset` calls (lines 268, 335, 472).
- [ ] `HelperToolSession.ts`: remove `clipSelectionForOffset` calls (lines 181, 241).
- [ ] Remove `clipSelectionForOffset` from `usePointerHandlers.ts` (lines 316, 416). Delete the function from `usePointerHandlerUtils.ts`. Delete `clipContextToSelectionMask` from `selectionMask.ts`.
- [ ] Remove `clipSelectionForOffset` from `ToolContext` type (`tools/types.ts:156`) and from `buildToolContext.ts` (lines 119, 198).
- [ ] Note: brush/eraser will paint outside selection until Phase 4 adds the GPU mask multiply — expected on a dev branch.
- [ ] Verify: typecheck + lint clean; no runtime errors on brush stroke.

### Phase 4 — GPU mask-multiply for stroke live preview

Eliminates the per-frame CPU feather during an active stroke. Commit-time masking (`applySelectionMaskAlpha` at stroke end) is **not** touched here — it runs once per stroke and writes the actual layer data; removing it would leave committed pixels unmasked.

- [ ] Add `MASK_MULTIPLY_BLIT_FRAGMENT` to `shaders.ts`: blits source texture to dest with `out.a *= textureSample(mask, maskUv)`. New shader, do not modify existing `BLIT_FRAGMENT`. Note: `maskUv` is not the same as the source `uv` — the stroke buffer is in layer space, so `maskUv` must be computed via doc space: `docPos = layerOffset + uv * strokeBufferDims`, then `maskUv = (docPos - maskOrigin) / maskDims`. Requires additional uniforms `layerOffsetX/Y` and `strokeBufferWidth/Height`.
- [ ] `WebGPURuntime.uploadStrokeMergePreview()` (line ~610): replace `drawStrokeBufferForDisplayWithSelectionFeather` call with a GPU mask-multiply blit pass. Remove `strokeMaskScratchCanvas` (line 123).
- [ ] `canvas2d/composite.ts:229`: remove `drawStrokeBufferForDisplayWithSelectionFeather` call.
- [ ] Delete `drawStrokeBufferForDisplayWithSelectionFeather` from `selectionMask.ts` (line 1378).
- [ ] Verify: feathered selection preview matches prior output during stroke; committed result after stroke end also correct (CPU path still applies mask at commit).

### Phase 5 — Remaining tools

- [ ] Pencil: verify it goes through the same `PaintSession` / stroke buffer path as brush — if so, Phase 4 already covers it with no additional work here.
- [ ] Flood fill: writes directly to the layer canvas (not through PaintSession). Apply mask as a CPU multiply on the filled region before committing — same pattern as blur/clone dirty-rect multiply.
- [ ] Gradient fill: render gradient into staging FBO → GPU mask-multiply blit (reuse Phase 4 pass). No CPU canvas readback.
- [ ] Shape fill: same GPU blit approach.
- [ ] Remove remaining `clipSelectionForOffset` calls from `ShapeTool.ts:229` and gradient commit paths.
- [ ] Blur / clone: per-move clip already removed in Phase 3 (via `HelperToolSession`). These tools do CPU `getImageData`/`putImageData` for their core operation — a GPU mask pass would add a roundtrip for no gain. Apply mask as a CPU dirty-rect multiply on the result buffer before `putImageData`. Same commit-only pattern as brush.
- [ ] Ctrl+C / cut: readback CPU `Selection.data` (already canonical) + GPU layer readback on copy action only — not a hot path, acceptable cost.

### Phase 6 — Cleanup

- [ ] Update **12 test files** that mock `clipSelectionForOffset: jest.fn()` — remove the mock field now that it's gone from `ToolContext`. (`toolHandlers`, `shiftLineBufferReuse`, `sharedToolModules`, `helperToolSession`, `segmentation`, `samplingContract`, `previewSessionRegression`, `moveTransformUnification`, `phase2TransformLifecycle`, `phase1Fixes`, `phase1Enforcement`, `paintSession`.)
- [ ] `helperToolSession.test.ts` test "1.1.6" (`clipSelectionForOffset is called during move`, lines ~420–454): **rewrite or delete** — it asserts call count `>= 2`, which will fail after Phase 3 removes the calls. If selection-respect is tested elsewhere, delete it; otherwise replace with a GPU-path equivalent.
- [ ] Delete any remaining dead code from `selectionMask.ts` (audit all exports). `applySelectionMaskAlpha` is still called by `PaintSession` at commit — do not delete until/unless commit path is ported to GPU.
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
- [ ] All paint tools respect active selection: GPU mask-multiply for brush/eraser/pencil/gradient/shape; CPU dirty-rect multiply for blur/clone/flood fill.
- [ ] Marching ants rendered via shader — no Path2D stroke in animation loop; ants visible outside canvas bounds when selection extends beyond doc.
- [ ] Undo/redo of selection changes correct: CPU array restored → GPU re-uploads on next composite.
- [ ] `npm run test` green; manual smoke: brush/erase/gradient/wand with feathered selection.

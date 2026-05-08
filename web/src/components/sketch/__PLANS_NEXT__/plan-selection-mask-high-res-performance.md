# Selection mask performance (2K / 4K)

Sequential plan for the current sketch codebase. The goal is to remove the remaining full-document selection hot paths so committed selections stay responsive at high resolution.

**Scope:** committed selection display, selection combine/finalization, selection-constrained tools, heavy selection mutations, and mask upload churn.

**Out of scope:** adding a new quick-mask tool, adding a WebGL fallback, or rewriting brush generation itself.

## Current baseline

These pieces already exist and should be treated as the starting point for this plan:

- `WebGPURuntime` already has a GPU `r8unorm` selection mask texture, ants shader support, and `setSelectionOriginOverride(...)`.
- `useOverlayRenderer.ts` still contains a Canvas2D marching-ants path behind `committedSelectionAntsOnGpu`.
- Selection finalization still combines CPU masks through `tools/selectionFinalization.ts` + `combineMasks(...)`.
- `FillTool.ts` and `GradientTool.ts` now route selection-constrained commits through a runtime mask-composite path instead of `applySelectionConstraint(...)`.
- Selection modify commands in `selectionSlice.ts` (`feather`, `expand`, `contract`, `smooth`, `border`) still run CPU-wide mask work on the main thread.

---

## Phase 1 — Remove committed-selection Canvas2D ants

- [x] Delete the committed-selection Canvas2D ants branch from `useOverlayRenderer.ts` (`antsPhaseRef`, `selectionPathCacheRef`, `buildSelectionMaskOutlinePath(...)`, `drawSelectionAntsFromPath(...)`, and the `committedSelectionAntsOnGpu === false` path for committed selections).
- [x] Keep live marquee / ellipse / lasso / polygon previews on the overlay canvas; only committed selections move fully to the GPU path.
- [x] Remove now-unused committed-selection outline helpers from `selection/selectionMask.ts` once no runtime callers remain.
- [ ] Verify that committed selections still animate, including during move-drag via `setSelectionOriginOverride(...)`.

---

## Phase 2 — Move selection finalization off `combineMasks(...)`

- [x] Replace the CPU `combineMasks(...)` hot path in `tools/selectionFinalization.ts` with a runtime-driven mask update path for `replace`, `add`, `subtract`, and `intersect`.
- [x] Wire marquee, ellipse, lasso, polygon, and magic-wand finalization in `SelectTool.ts` through that runtime path so a completed gesture updates the GPU mask without a full-document CPU combine.
- [x] Keep CPU `Selection` data as a snapshot/output format only: update it once per committed selection change for history, export, clipboard, and any code that still truly requires a buffer.
- [x] Add one explicit code comment at the runtime/store boundary that says when GPU state is authoritative and when CPU snapshots are produced.

---

## Phase 3 — Remove `applySelectionConstraint(...)` from interactive tools

- [x] Replace the current selection-constrained fill path in `tools/FillTool.ts` with a mask-aware runtime composite path so it no longer snapshots the whole layer and restores pixels with `applySelectionConstraint(...)`.
- [x] Replace the current selection-constrained gradient path in `tools/GradientTool.ts` with the same runtime composite path.
- [x] Preserve the existing early-out behavior where fill/gradient do nothing when the pointer-down seed is outside the active selection.
- [x] Delete `selection/applySelectionConstraint.ts` only after runtime callsites are gone, and confirm there are no production imports left outside tests/docs.

---

## Phase 4 — Make expensive selection mutations bounded or async

- [x] Rework `featherCurrentSelection`, `smoothCurrentSelectionBorders`, `convertSelectionToBorderOutline`, `expandCurrentSelection`, and `contractCurrentSelection` in `state/slices/selectionSlice.ts` so they no longer do full-document synchronous work for small edits.
- [x] For each operation, process only the selection ROI plus the required padding radius; if an ROI path is not practical, move the existing work to a worker/WASM path so the main thread stays responsive.
- [x] Keep the current undo/history contract: each command still commits one final `setSelection(...)` result and does not stream intermediate masks through the store.

---

## Phase 5 — Move magic wand off the main thread

- [ ] Run `magicWandFromRgba(...)` and `magicWandNonContiguousFromRgba(...)` off the main thread, with the main thread responsible only for scheduling the work and committing the result.
- [ ] When `sampleAllLayers` is enabled, build the sampled RGBA input once per invocation in the worker path instead of synchronously compositing on the main thread.
- [ ] Keep the current modifier semantics (`replace` / `add` / `subtract` / `intersect`) and final history behavior unchanged from the existing `SelectTool.ts` flow.

---

## Phase 6 — Reduce mask upload and subscription churn

- [ ] Stop re-uploading the entire mask texture for localized selection edits; update only dirty rectangles/tiles when the changed region is known.
- [ ] Make sure selection updates do not push large mask buffers through broad Zustand subscriptions or trigger editor remounts; keep compositor-facing invalidation narrow.
- [ ] Add lightweight profiling hooks or timings only if needed to prove which interaction still regresses at 4K.

---

## Exit checks

- [ ] At 4096×4096, committed-selection interactions (move ants, add/subtract/intersect, fill, gradient, wand, feather/expand/contract) avoid multi-second main-thread stalls.
- [ ] No committed-selection marching ants depend on Canvas2D `Path2D` generation or animation loops.
- [x] No interactive fill/gradient path depends on `applySelectionConstraint(...)`.
- [ ] CPU `Selection` snapshots are produced only at commit/history/export-style boundaries, not on every pointer move.
- [ ] The codebase has one documented rule for selection authority: which operations read/write the GPU mask directly, and when CPU snapshots are synchronized.

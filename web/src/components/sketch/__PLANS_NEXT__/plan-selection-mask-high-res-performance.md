# Selection mask performance (2K / 4K)

Sequential plan for an **unreleased** codebase: **one rendering path, one mask pipeline**, no legacy fallbacks. Execute phases in order; later phases assume earlier ones are done.

**Rendering commitment:** the sketch editor uses **WebGPU only** for compositing, mask passes, and selection display. **No WebGL** backend and **no WebGL fallback** — unsupported environments show a clear error or degraded non-interactive state, not a second engine.

**Context:** [`refactor-selection.md`](./refactor-selection.md) describes the existing GPU mask texture and ants shader — this plan finishes the job so **authoring**, **tools**, and **uploads** stay fast at full resolution.

---

## Phase 1 — WebGPU-only marching ants (delete CPU outline)

- [ ] Treat sketch compositing as **WebGPU-required** for this editor (no Canvas2D ant fallback, **no WebGL fallback**).
- [ ] Remove all use of **`buildSelectionMaskOutlinePath`**, cached `Path2D`, and CPU dashed stroke for **committed** selection; ants come only from the **mask texture + ants shader** (`WebGPURuntime`).
- [ ] Live previews (marquee rect/ellipse/lasso while dragging) may stay whatever they are today; only **committed** selection display goes through GPU.

---

## Phase 2 — Canonical live mask on the GPU

- [ ] **Authoritative mask for interaction** is a **`r8unorm` render target** (or equivalent) sized to the document; the compositor samples it for ants and for paint.
- [ ] **CPU `Selection` / `Uint8ClampedArray`** exists only for **history snapshots, export, and any algorithm that truly needs a buffer** — not updated on every `pointermove`.
- [ ] Marquee / lasso / polygon **combine** (add/subtract/intersect/replace): implement as **GPU passes** (or a single compositing step) that read the current mask texture and write the updated mask — **no full-frame `combineMasks` JS** on the hot path.
- [ ] When the user finishes a gesture or a history step is pushed, **sync GPU → CPU once** (readback or copy) so undo/redo and file export stay correct.

---

## Phase 3 — Mask brush / quick-mask = stamp compositing

- [ ] Brush add and subtract on the selection mask draw **only into the GPU mask target** using blend modes (same semantics as today: white adds, black subtracts — implemented with min/max or equivalent on R8).
- [ ] **One GPU→CPU sync** per stroke (or per coalesced frame batch), not per pointer event.

---

## Phase 4 — Tools: kill `applySelectionConstraint` pixel loops

- [ ] Replace `applySelectionConstraint` (full `getImageData` + per-pixel `selectionHitTest` + `putImageData`) with **one WebGPU compositing path** (draw to temp target, then multiply/clip by mask in the same engine as Phase 2 — no Canvas2D shortcutting at 4K).
- [ ] Audit remaining **`getImageData(0,0,w,h)`** in fill/gradient/clone paths and remove full-canvas reads from **interactive** code paths.

---

## Phase 5 — Magic wand off the main thread

- [ ] Run flood fill (contiguous and non-contiguous as needed) in a **Worker** with transferred buffers, **or** a **WGSL/compute** path — main thread only schedules work and applies the result into the GPU mask + one CPU snapshot for history.
- [ ] **Sample-all-layers** wand compositing: build the sampled RGBA buffer **once** in the worker path; avoid synchronous full composite on the main thread at 4K.

---

## Phase 6 — Morphology (expand, contract, feather, smooth, border)

- [ ] Implement using **ROI**: compute tight bounds of selected pixels (+ padding = operation radius), run morphology on **that window** only, blit back — **or** run full-frame ops entirely in a **Worker/WASM** so the main thread never blocks for seconds.
- [ ] Remove duplicated “full document” CPU passes where the ROI path is sufficient.

---

## Phase 7 — Uploads and React churn

- [ ] **Mask texture uploads:** after Phase 3, avoid full **256-aligned row upload** of the entire document on every tiny change; use **dirty rectangles** (or tiled updates) so typical strokes only touch a small region of the GPU texture.
- [ ] **Zustand/React:** mask dirty flags and texture handles must not **remount the editor** or subscribe the heavy tree to megabyte buffers; keep selection-derived updates **narrow** (refs, runtime callbacks, or atomic dirty flags the compositor reads).

---

## Exit checks (do last)

- [ ] **4096×4096:** continuous mask brushing holds a steady frame budget (target under **16 ms** on a mid-range laptop GPU; no multi-second main-thread freezes).
- [ ] Fill/gradient with selection: **no** full-canvas JavaScript pixel restore loops.
- [ ] Short dev comment at compositor entry: **canonical mask = GPU**; **when** CPU `Selection.data` is filled (history/export only).

---

## Not in this plan

- Dual Canvas2D/WebGPU user-facing modes.  
- **WebGL 1/2** rendering or fallback when WebGPU is unavailable.  
- Keeping CPU marching ants “for compatibility.”  
- Per-phase benchmarks before Phase 7 (optional micro-timing can be added during Phase 7 if something regresses).

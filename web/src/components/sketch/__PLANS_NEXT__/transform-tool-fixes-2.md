# transform-tool-fixes-2.md

Tight fix list for the remaining transform tool bugs. One root cause + one fix per issue.

## 1. Gizmo not visible until pan/click on tool switch

- **Root cause**: `useOverlayRenderer`'s effect calls `clearGizmo()` unconditionally on every `activeTool` change. Effects run in registration order; `useOverlayRenderer` is registered before `useToolLifecycle` (which calls `onActivate`), so the clear can race with — and overwrite — the tool's initial paint.
- **Fix**: in `useOverlayRenderer.ts`, treat `clearGizmo()` the same way `clearOverlay()` is already treated: skip it when `activeTool === "transform"` (and `gradient` for symmetry). The tool owns the gizmo lifecycle.

## 2. Layer bounds wrong (gizmo doesn't wrap content)

- **Root cause**: `getEffectiveRasterBounds` returns the full canvas size for any layer whose canvas hasn't been trimmed (fresh layers, post-bake layers stored without `__nodetoolRasterBounds`). For a small stamp on a 512² doc canvas the gizmo spans the doc.
- **Fix**: in `TransformTool.syncSingleLayer` (and `syncTransformTargets` multi-layer path), call `resolveGizmoBounds(layer, canvas, doc.canvas)` instead of `getEffectiveRasterBounds`. `resolveGizmoBounds` falls back to `contentBounds` and to opaque-pixel scan when the canvas is full-doc-sized. Renderer/reconcile already produce tight bounds after the previous fix; this pulls untrimmed layers back into line.

## 3. Warp/perspective gets stuck after one handle move

- **Root cause**: after a quad commit, `layer.transform.quad` is set but `transform.scaleX/scaleY/rotation` are also baked into the new transform via `buildQuadTransform`. On the next drag, `dragStartCorners = transform.quad` (good) but the *primary* transform path calls `getCurrentCorners` only when `dragStartCorners` is needed; for `move`/`rotate` it pulls from scaledHalfExtents which uses `rasterBounds × scaleX`. With a quad transform's synthetic scale, the rotate/move handle positions diverge from the quad-derived corner handle positions, so subsequent corner clicks miss.
- **Fix**: when `transform` is a quad transform, **always** drive `scaledHalfExtents`/handle positions/center from the quad — never from synthetic `scaleX/scaleY`. In `handleGeometry.buildHandlePositions`, the quad branch already uses corners; ensure the rotate handle and "move" hit-test in `hitTestHandles` also use quad corners (they do via `usesAdvancedAffineTransform`). The actual gap is in `TransformTool.center` — currently set via `getTransformedCenter(currentTransform, this.rasterBounds)` which for quad uses the quad center. Verify, and if `dragStartCorners` is null on a quad-mode drag, force-snapshot it.
- **Acceptance**: drag corner of a warped layer → release → drag a different corner → both work, and the warped quad keeps moving.

## 4. Scale and Distort look identical

- **Root cause**: `computeDistortTransform` moves the dragged corner *and* both adjacents (parallelogram), then bakes via `fitAffineFromCorners` through TL/TR/BL only. Result is always a parallelogram = scale + shear, visually indistinguishable from `computeScaleTransform` for axis-aligned drags.
- **Fix**: rewrite `computeDistortTransform` as a true 4-point distort: only the dragged corner moves by `delta`, all three other corners stay put, and the result is built via `buildQuadTransform(quad, …, "distort")` (quad mode, not affine). Add `"distort"` to `isQuadTransformMode` if not already there. This makes Distort = single-corner free distort (Photoshop "Distort"), Warp = free corner pull preserving smooth interior (current `computeWarpTransform`), Perspective = symmetric corner with opposite-edge counter-move (current `computePerspectiveTransform`). All three are now visually distinct.

## 5. Ctrl conflicts with quick-Move spring-load

- **Root cause**: `springLoadedModifiers.ts` blocks Ctrl/Cmd spring-load only for `crop` and `segment`. With the transform tool active, Ctrl/Cmd flips the interactionTool to `move`, which deactivates `transform` mid-press, so Ctrl-as-skew/from-center never fires.
- **Fix**: add `"transform"` to `SPRING_BLOCKED_TOOLS`. Inside the transform tool, Ctrl now stays a transform modifier:
  - **Shift** → constrain proportions / snap angle (already correct).
  - **Ctrl/Cmd** on edge → skew. On corner → scale-from-center. Combined with Alt+Shift → perspective. (Already wired in `resolveTransformGestureMode` + `computeStandardDrag.fromCenter`.)
  - **Alt** → scale-from-center (kept for Affinity parity; redundant with Ctrl on corners but harmless).

## Order

1. (5) — one-line guard, unblocks every other Ctrl-based gesture.
2. (1) — one-line guard in overlay renderer.
3. (2) — switch helper call in two places.
4. (4) — rewrite `computeDistortTransform` (~20 LoC) + small test update.
5. (3) — verify quad-mode drag invariants, add corner-snapshot fallback.

After each step: `npm run typecheck` + `npm test -- --testPathPattern=sketch`.

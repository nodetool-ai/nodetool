# Transform Tool Fixes and New Modes

Tracker for the multi-commit work to fix the Transform tool and add Perspective Single/Dual, Mesh Warp, and Perspective Distort.

## Phase 1 — Bug fixes and UX

- [x] 1.1 Stop switching to MoveTool on transform commit/cancel
- [x] 1.2 Remove AUTO mode from `TransformMode`, settings, panel, gesture resolver
- [x] 1.3 Style active mode toggle button clearly
- [x] 1.4 Affinity-style modifiers + bind `.` to reset transform
- [x] 1.5 Fix gizmo disappear / wrong position
- [x] 1.6 Fix rotate pivot when prior matrix transforms exist

## Phase 2 — Perspective modes

- [x] 2.1 Relabel existing perspective mode as "Persp 1"
- [x] 2.2 Add `perspective-dual` mode (secondary quad + composite renderer)
      - Type + renderer (`drawImageToDualQuad`) + bake (reconcile) + UI toggle
      - Secondary quad outline drawn on the gizmo (dashed) so users can see
        both planes
      - Per-handle editing of the second quad's outer corners is a planned
        follow-up; the first drag seeds a sensible secondary quad to the
        right of the primary's fold edge so the mode is usable today

## Phase 3 — Mesh Warp (preview)

- [x] 3.1 Mode entry + panel toggle (`mesh-warp`)
- [x] 3.2 Wire to existing 4-corner warp gesture so the mode is usable today
- [ ] Promote to a standalone `MeshWarpTool` with grid + bezier handles, Coons
      patch resampling, dedicated settings panel, and tests. Spec is in the
      original plan; the current mode-based entry preserves the same data
      shape so the upgrade is non-breaking.

## Phase 4 — Perspective Distort (preview)

- [x] 4.1 Mode entry + panel toggle (`perspective-distort`)
- [x] 4.2 Live perspective drag math reused via `computePerspectiveTransform`
- [ ] Promote to a standalone `PerspectiveDistortTool` with the inverse
      perspective bake (quad → unit square) so the chosen quad becomes the
      layer's bounding rectangle. Add tests for the inverse bake. The
      current preview ships the live-drag UX without the straightening
      bake.

## Notes for the standalone-tool follow-up

- Both Phase 3 and Phase 4 are intentionally scoped as `TransformMode`
  entries in this commit so the modes are visible and discoverable from
  the existing TransformSettingsPanel without churning every exhaustive
  switch on `SketchTool`. Promotion to standalone tools (`MeshWarpTool`,
  `PerspectiveDistortTool`) follows the original plan and only requires:
    1. Adding the tool ids to `SketchTool` and `getToolHandler`.
    2. Implementing the dedicated `ToolHandler` classes and gizmos.
    3. Replacing the mode-based `if` branches in `TransformTool.onMove`
       with the new tools' own `onMove` handlers.

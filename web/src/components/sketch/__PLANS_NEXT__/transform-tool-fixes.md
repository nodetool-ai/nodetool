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

## Phase 3 — Mesh Warp tool

- [ ] 3.1 Tool scaffolding (`MeshWarpTool`, mesh grid module, renderer, gizmo)
- [ ] 3.2 Settings panel + dispatcher wiring
- [ ] 3.3 Commit / bake action
- [ ] 3.4 Tests for grid math and warp render

## Phase 4 — Perspective Distort tool

- [ ] 4.1 Tool implementation (`PerspectiveDistortTool`, inverse perspective bake)
- [ ] 4.2 Settings panel + tool registration
- [ ] 4.3 Tests for inverse-perspective bake

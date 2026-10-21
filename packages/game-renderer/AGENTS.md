# game-renderer — Native Game Rendering, Capture and Export

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **game-renderer**

Read [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md) and the
[package rules](../AGENTS.md) before editing. This package draws native games
with three.js (3D) and WebGPU or Canvas 2D (2D), captures frames headlessly,
and builds the standalone players. The editor, the exported player and
`nodetool game capture` share the 3D renderer in `src/renderer3d/`, so a cost
added there is paid by every game on every frame.

## three.js performance rules

The renderer runs at the display rate, up to 120 frames per second beside a
60 Hz tick. Treat everything in `renderFrame` and every pipeline pass as a hot
path. Bare rule IDs (A1, F3) refer to the
[three.js performance rules](../../docs/research/threejs-game-performance.md).
The [engine audit](../../docs/research/native-game-engine-perf-audit.md)
(cited as audit F1 to audit F42) lists the costs this package has fixed and the ones that remain.

- **Fog and environment keep their object identity.** `configureGameEnvironment`
  mutates one `Fog` or `FogExp2` in place, and disables fog with a density of 0.
  A new fog object, `scene.environment` or `envMap` fails three.js's identity
  check and rebuilds the program of every fogged or lit material (A1, A2, A6).
- **One render target class per material.** A material drawn to the canvas and
  to a composer target holds two program variants and switches between them on
  every draw. Render the scene either directly or through the composer in
  `passes/post-processing.ts`, never both in one frame. Prewarm with
  `compile` once, against the target the frame uses (A3, A4, A7).
- **Nothing in the frame loop compiles, walks, uploads, allocates or
  snapshots.** No `renderer.compile`, no repeated `scene.traverse` (each feature
  walks the scene at most once per frame), no texture `needsUpdate` for an
  unchanged image, no `new Vector3`, object literals or spreads per object or
  per particle, and no `JSON.stringify`, `structuredClone` or physics snapshot.
  Key caches on object identity or a tick, and build the JSON key only when the
  identity changes (A6, B7, E1, E2, G1, G3, I5).
- **Shadow maps update on demand.** Each cascade light sets
  `shadow.autoUpdate = false` and `needsUpdate` from `gameCascadeDue3D` and its
  drift limit, so at most two cascades render per frame. Point and spot light
  shadows still re-render every frame (audit F4). Toggling `castShadow` or adding a
  light at runtime recompiles every lit material, so animate `intensity`
  instead (A5, C1, C2).
- **Soft particles never re-render the whole scene.** `GameParticlePass3D`
  draws a depth prepass only over meshes inside the soft emitters' bounds. The
  target design samples the composer's depth texture instead (F3, F2).
- **`renderer.info.programs` stays flat in steady play.**
  `GameRendererStats3D.programs` reports the count, and
  `nodetool game perf --fail-on-budget` fails on any growth during its measured
  window. A rising count means a material or light changes its variant every
  frame (A13).

Prove a change with counters and the GPU benchmark, not by reading code:

- `tests/frame-cost3d.test.ts` counts scene walks, `JSON.stringify` calls, HUD
  uploads and layouts in one steady frame, and skinned bounds per tick. Extend
  it when you add per-frame work.
- `nodetool game perf <game> --inputs <route.json> --profile <file>` measures
  exported play on the machine GPU and lists the hottest functions. In steady
  play, `getProgram`, `getParameters`, `traverse`, `takeSnapshot`,
  `JSON.stringify` or `structuredClone` among them is a bug. See
  [game performance commands](../../docs/harnesses.md#native-game-performance-game-bench-game-capture-game-perf).

# Native game rendering and export

Legacy games keep their WebGPU and Canvas 2D renderers. Import the 3D browser
renderer from `@nodetool-ai/game-renderer/browser3d`, capture from `node3d`, and
static export from `build3d`. The package's default entry does not import Three.js
or Rapier. A 3D player requires WebGL2 and reports capability failures explicitly.

Model import normalizes owned GLB or glTF input and its declared dependencies
into self-contained GLB bytes. Preparation rejects remote runtime dependencies,
unsupported required extensions, malformed geometry and over-budget resources.
Bindings record a digest, stable node and clip selectors, bounds and import
settings. Use meters, Y up and forward `-Z` after preparation. Primitive or convex
colliders belong to gameplay definitions. A model hierarchy cannot add scripts
or physics components.

Each instance owns its skeleton and animation mixer. Cosmetic clip sampling
uses the committed tick, which permits pause, rewind, restore and capture without
wall-clock drift. Geometry and textures share immutable caches. Renderer disposal
releases model instances, GPU resources and outstanding loads. Context loss
pauses the host before rebuilding rendering resources.

Captures run the same Three.js renderer in Chromium with a closed set of staged
bytes, cancellation and bounded time. Reports include the committed state hash,
capabilities, render statistics and projected entity bounds. Capture needs a
Playwright runtime and installed Chromium. Desktop packaging stages Playwright
and the capture bundle. The server profile intentionally omits browser automation
and reports unavailable capture capability.

Static export validates every asset digest and stages files atomically before
returning the output directory. It includes the game document, pinned runtime
code, QuickJS WASM, models, colliders, audio and fonts. Serve it over static HTTP
for browser module and WASM loading. Use HTTPS or loopback HTTP because asset
verification requires Web Crypto. The export needs no provider credentials.

Run `npm run test --workspace=packages/game-renderer` for model preparation,
skinning, animation sampling, shadows, lifecycle, capture and offline replay.
Hardware frame-rate targets in the [3D design](../../docs/plans/native-game-3d-upgrade.md)
remain separate from software-rendered correctness fixtures.

Run `npm run verify:electron3d --workspace=packages/game-renderer` after building
packages to render the registered capture bundle in the installed Electron
binary. It writes a PNG and backend/load statistics under
`nodetool-game3d-electron` in the operating system's temporary directory. The
Chromium lifecycle test writes `game3d-renderer-spike.json` in that directory's
parent. Both commands honor `TMPDIR` and report the tested resolution and GPU.
Their software-rendered timings do not establish the hardware target.

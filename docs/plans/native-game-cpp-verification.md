# Native game verification evidence

This record covers native 3D through A8.2 and native 2D through A8.3 in the
[port plan](native-game-cpp-port.md). The implementation remains uncommitted.
Browser delivery has a separate A8.4 gate.

## Release checks

The following commands completed with exit status zero against the native 3D
implementation, including the native tool, persistence, and harness changes:

| Check | Result |
| --- | --- |
| `npm run build:packages` | Passed |
| `npm run test:affected` | Passed across selected backend, web, Electron, and mobile suites |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed on a stable source tree after tests finished |
| `npm run dev:nodetool -- harness gate --base origin/main` | Passed |
| `npm run check:agents-docs` | Passed for native instructions and updated shipped skills |

Use a complete Node installation matching [`.nvmrc`](../../.nvmrc). The CLI's
real-package fixtures require the adjacent `npm-cli.js`, which a standalone Node
binary does not provide. Keep temporary files and logs on a filesystem with
enough quota. Run lint after tests that create temporary source files have
finished, so the file scan cannot race their cleanup.

Earlier runs exposed a stale canonical-plan expectation and missing native route
classifications in the sandbox API coverage map. Both were corrected and their
focused tests passed before the successful aggregate run. Existing TS sample
watchdogs also fired under shared load. The successful timing-sensitive run used
one workspace and one test worker without changing production limits.

## Native behavior and delivery

The native checks exercise document admission, bounded prefab expansion,
transactions, conflict handling, undo/redo, worker framing, script isolation,
fixed-tick gameplay, Jolt bodies and characters, collision masks, static meshes,
queries, rollback, source replacement, and authenticated snapshot continuation.
Focused script, asset, and core sanitizer checks passed. QuickJS's pinned opcode
packing requires its documented target-local signed-shift sanitizer exclusion.

The Qt player checks exercised visible primitive and HUD pixels, imported
textures, hierarchy and skeletal animation, directional shadows, windowed input,
exact-tick capture, and script-generated audio. Editor checks exercised pointer
and keyboard gestures, interleaved socket/UI edits, revision conflicts, draft
recovery, and save behavior. Linux GUI wrappers isolate these checks with Xvfb.

Standalone player and editor distributions were installed and run outside the
checkout without development Qt loader paths. Export admission, asset staging,
runtime notices, benchmark budget rejection, and the backend bundle smoke check
passed. The relevant repeatable entry points are:

- [Native runtime check](../../scripts/check-native-game.mjs).
- [Authoring service check](../../scripts/check-native-game-service.mjs).
- [Player check](../../scripts/check-native-game-player.mjs).
- [Editor check](../../scripts/check-native-game-editor.mjs).
- [Delivery check](../../scripts/check-native-game-delivery.mjs).
- [Benchmark workloads](../../scripts/check-native-game-bench.mjs).

An independent authoring trial created an asset-free course through the native
CLI, rejected a malformed script without advancing the saved revision, corrected
the script, saved and reopened the document, verified collection/gate/finish
assertions, matched midpoint replay, and inspected a native captured frame. The
bundled course and [service tests](../../packages/game-runtime/tests/native-cpp.test.ts)
provide a repeatable creation and verification path without provider credentials.

## Review and limits

Astra's A1/A2 review found that prefab expansion errors could escape admission
and that multiple unsaved edit revisions could not be saved. Regression tests in
[DocumentTest.cpp](../../native/game/tests/DocumentTest.cpp) and
[native-game.test.ts](../../packages/models/tests/native-game.test.ts) cover the
fixes. The follow-up source and regression-test review found no additional
concrete A1/A2 blockers. It excluded the later runtime and rendering work.

Snapshots restore only into their originating live session. Foreign sessions,
worker restarts, and cross-platform imports are rejected. Snapshot continuation
does not establish durable player-progress recovery.

Native graphical checks used Linux Vulkan through llvmpipe. Completed-frame
measurements include CPU and GPU work, and GPU-only timing is explicitly
unavailable. These results establish software rendering correctness, not a
hardware frame-rate target. macOS and Windows packaging were not executed.


## A8.3 native 2D runtime checks

Native 2D uses `native-cpp-1`, schema version 5 and `dimension: "2d"`.
Native 3D retains schema version 4. Both dimensions use the same session,
QuickJS lifecycle, timers, RNG, gameplay, command routing, rollback and
authenticated snapshot implementation. The dimension selects a `SpatialWorld`
backend. The 2D backend ports the TS constrained static and kinematic collision
semantics. It does not use Jolt or introduce dynamic rigid bodies.

The isolated native build and `ctest --test-dir native/game/build-a83-kernel
--output-on-failure` passed all selected native tests. These include the existing
3D session, document, worker, timing and benchmark checks, plus the 2D spatial and
shared-session regressions in
[Spatial2DTest.cpp](../../native/game/tests/Spatial2DTest.cpp) and
[Session2DTest.cpp](../../native/game/tests/Session2DTest.cpp).

The shared-session checks cover context-specific 2D transaction defaults,
movement, rejected 3D commands without a partial tick, foreign-session snapshot
rejection, replay, selected health targets, immutable selected-clip animation
sampling, scene-local gravity and presentation overrides through transitions,
and translated fixed grouping. Physics entities reject rotated or scaled
ancestry and moving ancestors during document admission. Spatial commands also
reject moving an ancestor of a physical entity. These limits preserve the
supported collision coordinate system explicitly.

The shared session regression, including 2D and 3D parented spawning, also
passed with `GAME_SANITIZERS=ON`, `ASAN_OPTIONS=detect_leaks=1` and
`UBSAN_OPTIONS=halt_on_error=1` in `native/game/build-sanitize`. This exercises the
2D document, QuickJS, session, spatial and snapshot paths with AddressSanitizer
and UndefinedBehaviorSanitizer. The 3D polymorphic boundary emits its vtable and destructor in an RTTI-enabled
source while its Jolt implementation keeps the existing RTTI-free setting. QuickJS retains the existing pinned
opcode-packing sanitizer exclusion described above.

Admission now constructs the same pure CPU 2D spatial backend for each expanded
scene before committing a document. This checks the runtime entity and obstacle
budgets, composed world-coordinate bounds, velocities, gravity, collision
dimensions and static tile-index limits. Prefab expansion also applies the 2D
entity budget before allocating its work list. The retained
[admission regression](../../native/game/tests/Admission2DTest.cpp) reproduced
previously admitted documents that failed session creation, then verified their
rejection before commit. It also verifies the supported entity boundary and an
unchanged revision after an overflowing transaction.

Review findings F6, F7 and F10 have retained regressions in the admission and
shared-session checks. Contact lifecycle identity uses the canonical entity pair
and sensor flag.
Changing contact normals during continuous sensor overlap retains `stay` and
reports the current normal. The shared-session regression reproduces a moving
actor crossing a sensor center. Parented spawning validates the union of live
entities and the new prefab expansion, while preserving runtime movement and
health. Both dimensions exercise that spawn regression.

Snapshots remain authenticated continuations for their originating live session.
They preserve animation selection, visual overrides and spatial state, but do
not establish portable saves or recovery after a worker restart. Browser delivery
remains the separate A8.4 release slice.

## Native 2D authoring and delivery

The native 2D course uses engine `native-cpp-1`, schema version 5, and dimension
`2d`. Native 3D remains schema version 4. Existing web documents retain their
engine routes. The CLI selects the course with `game native create <directory>
--dimension 2d` and exposes the matching script and transaction contract with
`game native schema --dimension 2d`.

The course owns its PNG atlas and WAV. It includes a tilemap floor, kinematic
player, moving solid, one-way platform, sensor collectible, scripted gate and
finish action, HUD, ambient and point lighting, and a parallax background.
Authoring operations select their defaults from the stored document dimension.
The editor client inspects the live document before normalizing a transaction
when its dimension is not supplied. That inspection uses a separate request ID
so it cannot consume the transaction's deduplication identity.

Focused verification passed:

- Runtime and editor client: eight tests passed. The authoring trial rejected bad
  source without changing the revision, added an entity with 2D defaults, saved
  and reopened the document, recorded movement and finish inputs, asserted player
  movement and score 11, and verified midpoint restoration and replay. A separate
  recorded-input fixture placed a rider on the moving platform and checked
  platform carry and replay across 30 ticks. The test first failed with the
  teleported platform, then passed after the course used static-body velocity.
- CLI: both native 3D and native 2D creation and authoring tests passed. The 2D
  test checked the prepared PNG, contextual entity defaults, and generated script
  declarations.
- Agent tools: six tests passed. Native 2D creation, dimension-specific schema
  discovery, contextual edits, focused inspection, and rejection of 3D transforms
  were covered alongside ownership, compact IDs, CAS, and native 3D regressions.
- Export admission: four tests passed, including rejection of mismatched
  dimension/version pairs and atomic cleanup after invalid assets.
- Actual delivery: the installed Qt player captured the 2D course after eight
  recorded ticks. The standalone exporter copied the installed distribution,
  ran its own capture smoke test, and preserved the exact authored document.
  This check passed again for the corrected velocity-platform course using the
  final core's installed player and runtime outside the checkout.

Repeat the focused checks after building protocol and runtime packages. Supply
`NODETOOL_NATIVE_GAME_WORKER` as an absolute path to the current built worker:

```bash
npm run test --workspace=packages/game-runtime -- tests/native-cpp.test.ts tests/native-editor-client.test.ts
npm run test --workspace=packages/cli -- tests/game-native-cpp.test.ts
npm run test --workspace=packages/agents -- tests/capabilities-native-cpp-game.test.ts
node scripts/run-vitest.mjs run scripts/__tests__/native-game-delivery.test.mjs
```

For the actual delivery check, build all installed targets, install the Qt
runtime, and set `NODETOOL_NATIVE_GAME_PLAYER` to its `bin/game-player` and
`NODETOOL_NATIVE_GAME_RUNTIME_DIR` to that installed distribution. On Linux:

```bash
cmake --build "$NATIVE_GAME_BUILD_DIR" --target game-worker game-player game-editor game-bench
cmake --install "$NATIVE_GAME_BUILD_DIR" --prefix "$NATIVE_GAME_INSTALL_DIR"
NODETOOL_NATIVE_GAME_PLAYER="$NATIVE_GAME_INSTALL_DIR/bin/game-player" \
NODETOOL_NATIVE_GAME_RUNTIME_DIR="$NATIVE_GAME_INSTALL_DIR" \
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan \
xvfb-run -a -s '-screen 0 1920x1080x24' \
npm run test --workspace=packages/game-runtime -- tests/native-cpp.test.ts -t 'captures and exports'
```

The delivery test has a 120-second integration-test timeout for copying and
checking the distribution. Production script and simulation watchdogs were not
changed. The Linux GPU checks establish rendering correctness under the software
driver used here. They do not establish hardware frame rates. Snapshot restore
remains authenticated to the originating live session. These focused results do
not replace the aggregate checks or establish completion of browser delivery.

## Native 2D Qt rendering and editing

The Qt player and editor dispatch native 2D documents through the same
`GameViewport` and QRhi presentation path used for windowed playback and
captures. The 2D pass draws GPU sprite and tile geometry with stable layer order,
atlas frames, premultiplied alpha or additive blending, nearest or linear
sampling, unlit materials, ambient lighting, and bounded point lights. Fixed
lights keep their authored slots and the nearest entity lights fill the remaining
slots. Backgrounds support parallax, committed-tick scrolling, repetition on both
axes or only X, and mirrored repetition. Image pivot and trim metadata affect
presentation geometry while entity transforms keep their collision meaning.

Raster assets pass through the existing closed manifest, size, and digest checks.
PNG and JPEG dimensions and cumulative decoded pixels are checked before pixel
allocation. Unsupported formats, excessive dimensions, invalid trim canvases,
and changed manifest bytes are rejected. Editor asset changes clear the displayed
image cache while the replacement is prepared.

The following Qt checks passed:

- [2D player pixel fixtures](../../native/game/tests/player2d_test.py) checked
  layer ordering and ties, atlas crops, opacity and additive blending, transparent
  color edges under linear premultiplied sampling, sampling modes, ambient and
  point lighting, nearest entity-light selection, unlit sprites, tile culling,
  ancestor transforms, animation, authored flips and motion facing, background
  modes and scrolling, scene overrides, pivot and trim geometry, and visual
  rotation and scale overrides. A windowed 2D player also rendered committed
  frames and recorded inputs.
- The capture harness's `--verify-restore` option took an authenticated checkpoint,
  advanced the live session, restored it, and checked committed entities before
  rendering. Its animation capture matched the ordinary capture at the same tick.
- [Render unit checks](../../native/game/tests/RenderTest.cpp) passed, including
  valid PNG and JPEG decoding, SVG rejection, and a valid oversized PNG header
  rejected by the dimension budget before decoding.
- [Editor unit checks](../../native/game/tests/EditorTest.cpp) passed for 2D
  translation, rotation in radians, scale, camera navigation, and concurrent agent
  edits that invalidate a pending drag.
- [Real editor gestures](../../native/game/tests/EditorGestureTest.cpp) passed for
  native 3D and native 2D, including hierarchy selection, pointer translation,
  keyboard undo and redo, cancellation, save, and an agent transaction during a
  pointer drag. These tests ran under Xvfb rather than opening desktop windows.
- The existing [3D player suite](../../native/game/tests/player_test.py) passed,
  including committed-tick capture, interactive playback, model animation,
  textures, shadows, and audio capture. All installed executable targets were
  built and `cmake --install` completed successfully.

Run the Qt checks against a configured build with player and editor enabled:

```bash
TMPDIR="$NATIVE_GAME_TMP_DIR" cmake --build "$NATIVE_GAME_BUILD_DIR" \
  --target game-player game-worker game-bench game-editor game-render-tests \
  game-editor-tests game-editor-gesture-tests
TMPDIR="$NATIVE_GAME_TMP_DIR" QT_QPA_PLATFORM=offscreen \
  ctest --test-dir "$NATIVE_GAME_BUILD_DIR" \
  -R '^native-game-(player-unit|editor)$' --output-on-failure
TMPDIR="$NATIVE_GAME_TMP_DIR" QSG_RHI_BACKEND=vulkan \
  xvfb-run -a "$NATIVE_GAME_BUILD_DIR/game-editor-gesture-tests"
TMPDIR="$NATIVE_GAME_TMP_DIR" QSG_RHI_BACKEND=vulkan \
  python3 native/game/tests/player2d_test.py "$NATIVE_GAME_BUILD_DIR/game-player"
TMPDIR="$NATIVE_GAME_TMP_DIR" QSG_RHI_BACKEND=vulkan \
  python3 native/game/tests/player_test.py "$NATIVE_GAME_BUILD_DIR/game-player"
```

The verified Qt build used Qt 6.12 and software Vulkan. These captures establish
pixel correctness and shared player/editor behavior, not hardware performance.

### Native 2D simulation measurement

The existing native benchmark API completed successfully against the final
native 2D core for the corrected velocity-platform 2D
course at revision 0 with seed 1, 60 warmup ticks, and 120 measured ticks. The
180-tick route moves right during its first four ticks and activates finish on
tick 6. A separate run verified score 11 and authenticated same-session midpoint
replay before benchmarking.

The benchmark host was an AMD Ryzen 5 3600 with 12 logical CPUs, Linux
`7.2.5-3-omarchy`, x64, and Node `v24.22.1`. The concurrent checks were
`npm run test:affected` and `npm run dev:nodetool -- harness gate --base origin/main`.
The reported measurement method is `host-roundtrip-ms`, including process
transport and scheduling. This headless simulation does not use a GPU or render
resolution. It measured p50 12.177 ms, p95 15.425 ms, and maximum 17.918 ms while
aggregate repository checks were active. This result does not isolate native tick
cost, establish an unloaded performance baseline, or establish player frame rate.
The full [measurement artifact](native-game-cpp-2d-bench.json) preserves the engine
build, document revision and digest, manifest, script digests, seed, complete input
route and input digest, capabilities, timing statistics, and host metadata. The
document, manifest, source, input, and prepared asset digests were rechecked
against the retained benchmark inputs after recording that metadata.

Reproduce with the existing `createNativeCpp2dCourse`, `simulateNativeCppGame`,
and `benchmarkNativeCppGame` exports from `@nodetool-ai/game-runtime/native`.
Create the course with ID `ffffffffffffffffffffffffffffffff` and title
`Native 2D measured course`. Use the artifact's `inputs`, verify replay over 180
ticks with final score 11, then benchmark with `{seed:1,warmup:60,ticks:120,inputs}`.

The native audio adapter also converts explicit 2D emitter positions and the
committed 2D camera center from `{x, y}` to mixer coordinates `[x, y, 0]`.
Continuing music uses the same conversion when restored. Shared session events
keep their 2D coordinate objects, explicit positions remain world coordinates,
and unpositioned audio remains global even when its event carries an entity ID.
The 3D emitter and listener path retains its existing three-coordinate arrays.

Before this fix, the retained
[positioned 2D WAV regression](../../native/game/tests/player2d_audio_test.py)
failed with an array-conversion diagnostic and zero voices. After the fix,
`native-game-audio`, `native-game-player-audio`, and `native-game-player2d-audio`
passed. The WAV check exercises actual session commands, a nonzero emitter Y,
and a camera under a translated parent. Camera movement changes stereo pan and
Y-distance attenuation in the captured samples. The
[adapter unit regression](../../native/game/tests/PlayerAudioTest.cpp) also
checks exact equivalence to 3D emitter/listener coordinates, positioned music
restoration, and global unpositioned audio.

```bash
TMPDIR="$NATIVE_GAME_TMP_DIR" cmake --build "$NATIVE_GAME_BUILD_DIR" \
  --target game-player game-audio-tests game-player-audio-tests
TMPDIR="$NATIVE_GAME_TMP_DIR" ctest --test-dir "$NATIVE_GAME_BUILD_DIR" \
  -R '^native-game-(audio|player-audio|player2d-audio)$' --output-on-failure
```

## A8.3 harness and installed runtime verification

The complete harness gate passed after the admission, contact, spawn and audio
review fixes. Regenerating the capability table resolved its earlier drift
failure. New pixel and positioned-audio Python fixtures select the native player
harness when changed. The selection regression failed before the mapping fix
and passed afterward in
[harness-registry.test.ts](../../packages/cli/tests/harness-registry.test.ts).

The final player wrapper passed the renderer unit, 2D audio, 2D pixel and live
input, and existing 3D player checks. The final editor wrapper passed its unit,
UI and real gesture checks. The delivery wrapper repeated the player checks and
verified an installed standalone capture with bundle-local Qt libraries. The
corrected velocity-driven 2D course also passed capture and standalone export
using that final installed runtime.

Repeat these checks with the pinned Node and Qt installations and a writable
temporary directory:

```bash
npm run dev:nodetool -- harness gate --base origin/main
node scripts/check-native-game-player.mjs
node scripts/check-native-game-editor.mjs
node scripts/check-native-game-delivery.mjs
```

The wrappers isolate Linux GUI checks with Xvfb. The installed capture used
llvmpipe, so it establishes software-rendering and packaging correctness.

The frozen A8.3 source also passed `build:packages`, the complete
`test:affected` run, `typecheck`, `lint`, and `check:agents-docs`. Backend tests
ran one workspace at a time with four test workers. Web, Electron, and mobile
suites passed. No production script watchdog was weakened. An earlier aggregate
started before review fixes was stopped and is not counted as this release
result. Documentation links, control bytes, and `git diff --check` passed.

## A8.4 portable core

The portable target was built with Emscripten 6.0.13, pinned in
[emsdk.version](../../native/game/browser/emsdk.version). Its dedicated browser
CMake entry reuses the document, script, asset, simulation, and dispatcher
targets. The build helper inspects a nonempty compilation database and rejects
Qt, native audio-device, stdio-worker, and pthread inputs. The browser target
excludes Jolt's thread-pool implementation. C++ exceptions are enabled throughout
the portable compilation and link. Only Jolt-owning `World.cpp` disables RTTI.

The following commands completed with exit status zero against the staged
module. The SDK and build directory are local paths and can be relocated.

```bash
node native/game/browser/build.mjs \
  --sdk /home/mg/.cache/native-game-emsdk \
  --build-dir /home/mg/.cache/native-final-tmp/a84-wasm \
  --output-dir packages/game-renderer/dist
node native/game/tests/wasm-bridge-test.mjs packages/game-renderer/dist/native-game.mjs
node native/game/tests/browser-bridge-test.mjs packages/game-renderer/dist
node native/game/tests/wasm-bridge-oom.mjs packages/game-renderer/dist/native-game.mjs
node native/game/tests/native-wasm-parity.mjs \
  native/game/build/game-worker packages/game-renderer/dist/native-game.mjs
```

The shared C interface fixture passed 197 assertions in Node-hosted WASM and a
real Chromium module worker. It creates, edits, runs, restores, and closes 2D and
3D sessions. It also exercises request retries and conflicts, malformed UTF-8,
the 16 MiB message limit, out-of-heap pointers, eight-context admission, stale
handles, isolated live contexts, script watchdogs, guest allocation limits,
script errors, and tick rollback. Snapshot tests accept the originating live
session and reject tampered or foreign snapshots. Removing browser crypto makes
simulation startup fail with `unavailable_capability`. Snapshot keys do not use
the deterministic game seed.

A controlled entropy callback attempts nested dispatch, context creation, and
destruction of both the active and another context. Nested dispatch returns
`-2`, creation returns zero, and destruction is ignored until dispatch completes.
Response access remains read-only. Both contexts remain usable afterward. A
pthreads build is rejected at compilation, preserving the synchronous ownership
required by the shared browser scratch allocator.

The separate bridge allocation test retains a 480 MiB WASM allocation while
dispatching a 15 MiB JSON request. The resulting C++ allocation failure returns
a bounded `resource_limit` response through an allocation-free emergency buffer.
After releasing the pressure allocation, a second live context still dispatches
successfully. This exercises bridge heap exhaustion in addition to QuickJS's
guest memory budget.

The native-worker parity fixture launches the actual MsgPack stdio executable
and compares its decoded responses with the WASM C interface. It uses the same
authored documents, seed, and recorded inputs. It covers admission, retries,
revision changes, undo/redo, dimension-specific input errors, 90 committed steps
per dimension, moving-platform carry and contacts in 2D, and Jolt character
motion, contacts, and ray queries in 3D. Both scripts emit save/load requests and
retain recorded load responses in guest state. The run compared 84,512 values,
including 39,874 numbers. Object fields, array order, strings, booleans, and
events must agree exactly. Numeric comparison allows absolute error `1e-5` plus
relative error `1e-6`. Coverage assertions observed 180 2D events, 64 3D events,
90 3D query results, and two storage requests per dimension.

The same fixture repeats open, start, step, reload, snapshot, same-session
restore, step, and close for 25 cycles in both dimensions. Each host restores its
own authenticated snapshot. The final 20 cycles must have one unchanged WASM
linear-memory extent, and the C interface context is destroyed afterward.
Per-world 64 MiB Jolt scratch allocations initially caused fragmentation and
growth from 284,164,096 to 491,126,784 bytes in this stress case. The browser now
owns one 64 MiB scratch allocator per module, guarded against reentry. Native
worlds retain their separate allocators. Jolt updates check that scratch is empty
afterward. The corrected run held the extent at 139,198,464 bytes throughout all
25 cycles. This measures the memory extent, not resident memory or live allocated
bytes. The module retains its fixed scratch capacity until module disposal.

The final native worker, bridge test executable, and player were rebuilt after
the scratch invariant was added. Native bridge and framed-worker tests passed.
The registered live 2D keyboard CTest passed three consecutive runs through
`ctest --test-dir native/game/build -R '^native-game-player2d-live-input$'
--repeat until-fail:3 --output-on-failure`. The test uses an isolated Xvfb display,
waits for rendered content and confirmed focus, then holds a real XTest key press
through committed simulation ticks. The native-worker/WASM parity fixture also
passed again against the rebuilt worker.

Native asset preparation is also exercised in Node and Chromium WASM. A closed
glTF triangle with a declared external buffer produces three admitted vertices,
and changing its buffer bytes fails digest validation. The bridge reads only the
isolated `/assets` virtual root and releases native preparation graphs after
serialization. Native builds reject this browser-only operation. Per-call limits
are 8 MiB per file, 16 MiB total input, 50,000 vertices, 150,000 indices, 1,000
nodes, and the 16 MiB response limit. These fixtures do not establish browser
rendering equivalence or hardware frame rates. Whole-dispatch timing includes
simulation and script work. Script-only latency is not instrumented here.

## A8.4 installed browser export

The native web target uses the installed module, WASM, worker, and player
registered as package assets. The exporter verifies runtime and owned asset
hashes, then dispatches native `validate` through a verified temporary WASM
profile. That operation validates C++ document semantics and compiles every
QuickJS script before publication. It needs no source checkout, SDK, native
executable, provider key, or NodeTool server. Desktop remains the default target.

The retained integration fixture packs and unpacks the runtime and renderer
packages, runs the installed exporter in an isolated directory with application
credentials and development loaders absent, and serves the result over static
HTTP. Both dimensions advance, accept keyboard restart and a HUD button click
within one JavaScript task, and continue after generation changes. The full browser request
set remains inside the exported inventory. Default play retains no input history.
Explicit recording emits committed inputs. Corrupt WASM produces a startup error.

Faulty QuickJS source, an expanded prefab identity collision, and rotated native
2D physics fail before an output directory or sibling staging exists. Removing
the native validation dispatch makes these retained tests fail. The filesystem
tests also reject altered assets and runtime files, traversal, an existing
destination, cancellation, and empty fixture discovery.

Reproduce the installed checks after building the browser profile:

```bash
node scripts/check-native-game-browser.mjs
node scripts/check-native-game-browser.mjs --native-player /path/to/installed/bin/game-player --native-runtime /path/to/installed
```

The explicit check requires real staged artifacts and never substitutes a mock
module or legacy simulation. It runs the native worker/WASM semantic comparison,
real browser workers, IndexedDB persistence, recorded loaded-response replay,
the 2D GPU pixel matrix, installed exports, and CLI/agent authoring. The optional
installed-player arguments also enable native/browser pixel comparisons and the
BSDF reference probes. The installed desktop capture/export test runs separately:

```bash
NODETOOL_NATIVE_GAME_PLAYER=/path/to/installed/bin/game-player NODETOOL_NATIVE_GAME_RUNTIME_DIR=/path/to/installed NODETOOL_NATIVE_GAME_WORKER=/path/to/Release/game-worker npm run test --workspace=packages/game-runtime -- tests/native-cpp.test.ts
```

CI builds the pinned browser profile first.
Ordinary package suites gate actual-module integration on
`NODETOOL_NATIVE_BROWSER_PROFILE=1`. With WASM temporarily absent, the ordinary
native-browser suites passed, while the explicit check failed with a missing
profile error. The artifact was restored in `finally`.

### Browser measurements

[The saved report](native-game-cpp-browser-bench.json) contains exact artifact,
document, and admitted-input digests, raw recorded inputs, resource transfers,
and 120 timestamped completion samples per dimension. Its reproduction sources
are the shipped course factories, installed export tests, and native/WASM
semantic fixture.

The measured host was an AMD Ryzen 5 3600 running Linux
`7.2.5-3-omarchy` on x64, with Chromium `148.0.7778.96`, ANGLE SwiftShader,
and a 960 × 540 viewport. Each dimension launched a fresh browser process,
context, and page. Startup measures navigation to the first completed canvas
frame, including default gzip compression at the fixture HTTP server.
OS caches were uncontrolled. Restart checks supplied warmup before the
timestamped steady samples.

| Measurement | Native 2D | Native 3D |
| --- | ---: | ---: |
| Gzipped response body bytes fetched | 1,674,455 | 1,674,063 |
| Navigation to first completed canvas frame | 681.50 ms | 934.01 ms |
| Mean interval between completed canvas frames | 18.05 ms | 17.22 ms |
| Canvas CPU + GPU completion p95 | 0.40 ms | 0.80 ms |
| Whole native dispatch p95 | 18.70 ms | 18.20 ms |
| Steady WASM linear-memory extent | 67,108,864 bytes | 96,665,600 bytes |
| Extent growth during the measured window | 0 bytes | 0 bytes |

Canvas completion uses the explicit `?benchmark=1` path and `gl.finish()`.
Normal play does not synchronize the GPU this way. These samples exclude the
DOM compositor and display presentation and are not isolated GPU timings.
SwiftShader measurements establish correctness, not a hardware frame-rate gate.

Linear-memory extent is the size of the WASM addressable memory, not live
allocation, process RSS, or decoded/GPU asset memory. Resource timing measures
encoded and decoded HTTP body bytes, not decoded media allocation. Decoded asset
memory, GPU asset memory, isolated script latency, and isolated GPU-only timing
remain uninstrumented. Whole native dispatch includes simulation and scripts.

The native worker/WASM fixture compared 136,656 values, including 70,962 numeric
values, with absolute tolerance `1e-5` and relative tolerance `1e-6`.
Discrete state and ordered events match exactly. It includes moving-platform
carry, 3D ray queries, 333 particle samples with 14,320 particle numeric comparisons,
save/load response replay, invalid inputs, transactions,
undo/redo, and request retries. Its 25 repeated lifetime cycles reached a
139,198,464-byte extent after the first cycle and held it constant through the
remaining cycles, leaving no live contexts. Full-world snapshot
continuation remains authenticated to the originating live session.

### BLACKSITE example QA (legacy TypeScript engine)

The shipped [BLACKSITE source](../../packages/game-runtime/samples/blacksite/README.md)
uses schema version 3 and engine version 2. This example QA covers the legacy
TypeScript simulation and renderer. It provides no coverage of the C++ port.
The source document and installed assets were exported without conversion.

The recorded completion route passed all assertions through tick 583 with seed
1. All five drones were inactive at tick 223, `victory` occurred at tick 560,
and the player was grounded at tick 583. Replay resumed at tick 291 and matched.
The browser export replay reached the visible “SECTOR CLEAR / EXTRACTION
COMPLETE” screen with armor 100 and eight rounds. Completion uses the scripted
event, so `snapshot.won` remains false as documented by the example.

Manual browser input on the focused canvas moved the player with W from
`(0, 0.81, 7)` to approximately `(0, 0.809, 5.762)`. Holding F consumed two
rounds and damaged the first drone. R started reload, and advancing 72 idle
frames restored the magazine to 18 rounds. Pause held tick 92 unchanged across
a 500 ms observation. Clicking Reset returned to tick 0 and the starting pose.
Mouse aiming and jump were not checked manually. Audio assets loaded, but
audibility was not assessed.

The CLI combat capture at tick 120 reported 653 draw calls against a limit of
1,000 and 4,123,552 triangles against a limit of 1,000,000. The triangle budget
failed. Twelve decals reported `Scene decal source triangle work limit
exceeded`. The simulation benchmark across the recorded 583-tick route, without
warmup, passed its 4 ms budget with tick p95 3.36 ms and script p95 1.61 ms.
Software browser rendering establishes visible behavior, not hardware frame
rate. The full frame-time performance gate was not run for this example QA.

Reproduce simulation, export, and capture with the commands in the example
README. Run the simulation benchmark with:

```bash
npm run nodetool -- game bench packages/game-runtime/samples/blacksite/game.json --ticks 583 --warmup 0 --inputs packages/game-runtime/samples/blacksite/completion.inputs.json --assets-dir packages/game-runtime/samples/blacksite/assets --fail-on-budget --json
```

Local screenshots and logs are retained in
`/home/mg/.cache/native-final-tmp/blacksite-example-qa/`: `start.png`,
`combat.png`, `extraction.png`, `manual-moved-fired-reloaded.png`,
`simulate.log`, `build.log`, `capture-combat.log`, and `bench.log`.

### Earlier BLACKSITE native first-person QA

This section records the earlier simplified copy before visual parity work.
Its omissions describe that test copy and the renderer at that point, rather
than current native capabilities. The final copy restores the complete rifle,
translucent field and visual systems. See [the final visual evidence](native-game-blacksite-visual-parity.md)
and the final Qt capture results below.

A separate schema 4 `native-cpp-1` copy runs BLACKSITE with C++/QuickJS/Jolt
simulation and the Qt player. The legacy source remains unchanged. The native
copy uses the first-person camera attached to the player at `[0, 0.65, 0]`,
78-degree field of view, clipping planes 0.03 and 160, and authoritative
simulation yaw/pitch for movement and rifle rays. The rifle uses the admitted
camera-relative visual binding.

The original seed-1 input route passed native CLI assertions through tick 583,
including five kills by tick 223, extraction score 105, and a grounded player.
Same-session replay from tick 291 matched. Native victory occurred at tick 557,
compared with tick 560 in the legacy engine. The native character contract
does not reproduce legacy acceleration, coyote time, or jump buffering. This
test establishes completion in each engine, not exact cross-engine equivalence.

The live Qt player received actual X11 input on an isolated Xvfb display. W
moved the player from z=7 to z=3.1000059. Right-drag recorded mouse delta
`[30, -10]` and changed the committed first-person camera. F and R recorded
the authored fire and reload actions. The player continued through 270 ticks.
The input driver waited for the first rendered frame before sending keys.

The facility was split into three model assets to fit native model limits.
All 714,156 source indices, representing 238,052 triangles, remain. Vertex
attributes, materials, texture bytes, node transforms, and the binary GLB
buffer remain unchanged. Only the rifle's genuinely translucent optic-glass
surface, 44 triangles with alpha 0.16, was removed from the test copy. The
opaque extraction frame, sill, and beacons remain. The translucent extraction
field was omitted because native 3D blending was unavailable in that earlier build.

That copy used fixed lighting that differed from the legacy scene lights and post-processing.
The normal-map and emissive material channels remain in the model files but
are not rendered. Legacy decals, particle prefabs, animated drone hover,
camera recoil, weapon animation, widget HUD, streamed music, and spatial
prefab sound timing are omitted. The copied player script retains rifle
queries, cover, ammunition, reload, damage, drone health, kills, and extraction.
Admitted audio commands retain shot, reload, hit, hurt, destruction, and victory
cues. Audibility was not assessed.

The native benchmark completed the 583-tick route without warmup. Its
host-to-worker round-trip p50 was 21.30 ms and p95 was 29.45 ms. These include
transport and serialization and do not isolate simulation or scripts. Qt
captures use Vulkan with llvmpipe and establish visible behavior only. They
do not establish a hardware frame-rate budget. A concurrent render/build run
hit the unchanged 20 ms script watchdog. The isolated CLI rerun passed all
assertions and replay without changing that budget.

[Saved native evidence](native-game-blacksite-qa.json) records document, script,
input, and original/adapted asset digests, geometry totals, assertions, live
input observations, and benchmark results. The local test copy and reproduction
scripts are in `/home/mg/.cache/native-final-tmp/blacksite-native-qa/`.
Screenshots are `start.png`, `combat.png`, and `extraction.png`.

Reproduce the native simulation with the prepared test copy:

```bash
QA=/home/mg/.cache/native-final-tmp/blacksite-native-qa
NODETOOL_NATIVE_GAME_WORKER=$PWD/native/game/build/game-worker npm run nodetool -- game native simulate "$QA/blacksite-native.json" --ticks 583 --seed 1 --inputs "$QA/completion.inputs.json" --assertions "$QA/completion.assertions.json" --verify-replay --json
```

`adapt_blacksite.py` prepares the copy from the shipped source without asset
generation. `capture_artifacts.py` captures the first-person Qt views at ticks
0, 120, and 583. `live-input.py` drives W, right-drag, F, and R in its own Xvfb
display and records the admitted input frames.

## Native first-person camera extension

Native 3D now admits a first-person document camera bound by `targetId` to an
entity in each scene. The default eye offset is `[0, 0.65, 0]`, with FOV 78,
near plane 0.03, and far plane 160. Angles use radians. Recorded look deltas use
raw pixels per tick. Yaw subtracts horizontal look times sensitivity 0.002, and
pitch subtracts vertical look times the same sensitivity, clamped to -1.3 through
1.3 by default. The shared Session emits resolved position, target, FOV, and clip
planes. Scripts receive the current tick aim as `i.camera`, including yaw, pitch,
forward direction, and eye position. This aim is resolved once per tick before
script hooks. Physics then advances the bound entity before the displayed camera
position is resolved. Camera angles participate in authenticated snapshots,
rollback, and replay. Reload restores the authored angles. Fixed cameras and
native 2D remain supported.

A root model may set `visual.cameraRelative: true`. The core resolves its local
position and quaternion into the committed camera pose in frame entities, then
removes that flag from the resolved visual. It leaves authored and simulation
transforms unchanged. Such models cannot have a body, collider, character, scene
parent, or scene-entity children. Internal glTF hierarchy remains supported. This
is a viewmodel transform, without a new camera command or recoil extension.

The focused protocol suite passed 13 tests, protocol build passed, and generated
schema drift checks passed. The native camera test passed look integration,
current-tick script aim, clipping bounds, movement following, pitch clamping,
malformed-input atomicity, failed-tick rollback, snapshot continuation, reload,
fixed-camera preservation, resolved viewmodel position and turning, and the
explicit viewmodel admission restrictions. Existing native 3D Session, 2D Session,
document, and framed-worker checks passed. Final camera, 3D Session, 2D Session,
and worker checks passed again after the once-per-tick aim cache was added.

The portable feature fixture first failed on the previous WASM artifact because
first-person camera admission was unavailable. After rebuilding with the pinned
Emscripten helper, Node-hosted WASM and a real Chromium module worker each passed
225 assertions. The added checks include first-person projection, script-visible
angles, camera snapshot replay, and resolved viewmodel output. The separate
bridge heap-exhaustion and second-context recovery check also passed.

The actual native-worker versus WASM fixture now includes first-person camera
look on the Jolt course. It passed 87,413 recursive comparisons, including 42,203
numbers, with the existing absolute `1e-5` plus relative `1e-6` tolerance. Exact
field and event comparisons, recorded storage results, and both dimensions remain
covered. Its repeated 25-cycle lifetime test again held the WASM linear-memory
extent at 139,198,464 bytes with the final context destroyed. These checks establish
shared simulation and camera output. Qt and browser pixel/input evidence belongs
to their presentation checks. Logs use the `fps-` prefix under
`/home/mg/.cache/native-final-tmp/`.

The final Qt camera build also passed five focused CTests: renderer units, live
2D keyboard input, first-person camera input, camera pixels, and the existing 3D
player test. The camera input fixture sends real XTest pointer and keyboard
events, including pointer capture and release plus held F/R actions. The pixel
fixture checks a 90-degree turn, fixed-camera equivalence, viewmodel placement,
near/far clipping, and restore. The final player binary includes the shared
once-per-tick aim cache. These results are recorded in
`firstperson-qt-final-tests.log` under the same temporary directory.

## Final aggregate verification follow-up

The first post-camera `test:affected` run failed in the legacy TypeScript
benchmark fixture on its unchanged 20 ms per-call watchdog. A focused rerun
also failed at a different entity and tick before checkpoint creation.
The subsequent full one-worker run passed that fixture but failed five
legacy AETHER, RIDGELINE and Sunrush Kart cases on their unchanged 50 ms
batch watchdog. These timing failures remain unresolved. The native
BLACKSITE completion, replay and Qt input results above do not imply that
the aggregate gate passed.

Reproduction logs are under `/home/mg/.cache/native-final-tmp/`:
`firstperson-test-affected.log`, `firstperson-benchmark-isolated.log`, and
`firstperson-affected-one-worker.log`. No production watchdog was relaxed.
The per-call clock requires both thread CPU and elapsed time to exceed its
limit after recorded V8 GC subtraction. The batch limit uses elapsed time.
Shared load alone has not been established as the cause.

A subsequent three-file comparison used a separate HEAD checkout at
`4834b49ef14480620cfbd88d0d4a971a18c99b34`, without the uncommitted port.
Its protocol package was force-rebuilt locally before testing. Node 24 and
one test worker were used in both trees, with the same watchdog limits.
The HEAD run failed two Sunrush Kart cases on the 50 ms batch watchdog.
The immediately following port-tree run failed one Sunrush Kart case on
that watchdog. AETHER and RIDGELINE passed in both isolated runs. This
establishes that the Sunrush timeout can occur before the port. It does
not establish a cause for every earlier timing failure or make the full
aggregate green. Logs: `watchdog-baseline-protocol-build.log`,
`watchdog-baseline-three-files.log`, and `watchdog-current-three-files.log`
under the cache directory above.

The first full harness gate passed 19 of 20 selfchecks. Its only failure
was generated capability-table drift. `capabilities:sync` subsequently
passed. Four native-host conditional object spreads reported by lint were
replaced with typed optional-property assignment, with focused tests and
lint passing. The refreshed package build passed all 73 tasks.

Read-only comparison with HEAD found no changes to tracked legacy runtime
source, tests, or sample documents and inputs. The protocol barrel now exports
the native-game schemas, so legacy imports also initialize those Zod schemas.
The native browser host is not exported by the legacy runtime entry point.
Additional schema allocation is a possible source of indirect GC pressure,
but neither that mechanism nor a port regression has been demonstrated.

A later host sample observed 12 online CPUs and CPU pressure of 11.90% over
10 seconds, 16.80% over 60 seconds, and 21.82% over 300 seconds. Other worktrees
were compiling C++ and running lint, while browser GPU processes used
SwiftShader. These measurements establish concurrent runnable-task stalls
during inspection. They do not measure the failed batches or prove why those
batches exceeded 50 ms. Descheduling and GC count against the elapsed-time
batch limit even when Vitest uses one worker.

The comparison baseline must run the same three legacy test files from a
detached HEAD tree with the same Node version and third-party dependencies.
Its protocol package must resolve inside that tree. A symlink to the current
workspace's protocol source or generated output would contaminate the baseline.
No further tests were started during the export verification window, and no
script-clock, fixture, or production-limit changes were made for this diagnosis.


## Portable image admission and native simulation cost

The full BLACKSITE model files exposed a portable transport failure. A fresh
WASM build rejected the five earlier facility chunks because each encoded GLB
was approximately 14 MiB, above the existing 8 MiB file limit. Externalizing
the four unchanged PNGs made the geometry files admissible, but serializing
those PNGs as JSON number arrays then aborted the first preparation call at
the configured 536,870,912-byte WASM heap extent. Both failures were reproduced
before changing the image result contract. The 8 MiB file, 16 MiB dependency
closure, 16 MiB response, and 512 MiB linear-memory limits were preserved.

Prepared images now return only
`{mimeType,source:{assetId,offset,length,digest}}`. The digest covers the encoded
PNG or JPEG range. The native importer retains encoded image bytes for Qt and
records their verified external-image, external-buffer, or embedded-GLB source
range. Browser results contain no image byte arrays. The host resolves a range
only from already verified bytes in the selected model's declared dependency
closure. Native unit tests cover whole external PNGs, ranges in declared BIN
files, absolute GLB BIN payload offsets, MIME signatures, and range digests.

The retained [actual asset check](../../native/game/tests/wasm-model-assets-test.mjs)
passed for all five externalized facility chunks, the unchanged rifle including
optic glass, and the drone. It verified source file hashes, dependency closure
membership, encoded image ranges, image hashes, and MIME signatures. The largest
response was 7,121,557 bytes. The largest input dependency closure was
14,187,284 bytes. Peak WASM extent was 115,998,720 bytes. All four facility PNGs
retained their original 12,785,992 encoded bytes in total. The drone's response
decreased from 12,016,580 to 739,230 bytes. These measurements establish bounded
admission and transport. Renderer checks establish decoding and visible output.

Reproduce the asset check after building the portable module and preparing the
closed BLACKSITE fixture:

```bash
node native/game/tests/wasm-model-assets-test.mjs \
  packages/game-renderer/dist/native-game.mjs <closed-asset-directory> <report.json>
```

The native full-route timeout was investigated without increasing the existing
120-second host deadline or a script watchdog. Both existing development worker
builds were Debug. An isolated Release worker was configured without Qt at
`/home/mg/.cache/native-final-tmp/visual-release-worker`, using the same pinned
dependency sources and building only `game-worker`. The same first 120 input
frames took 40.84 seconds through the Debug worker and 5.99 seconds through the
Release worker, including host parsing and an external snapshot request.

The Release run then completed all 583 input frames and a 292-step authenticated
same-session replay under the unchanged deadline. It finished at score 105 with
no drones remaining and 1,050 particles. The full run captured 583 frame hashes
before and after removing the duplicate particle output construction. Every hash
matched, and both runs verified all 292 replayed frames. Total elapsed time was
59.99 seconds before and 54.85 seconds after the optimization.

Existing native timing instrumentation measured the specific duplicated cost.
At 980 particles, reconstructing resolved particle JSON took about 4 ms. The
step previously built that old particle output and immediately replaced it after
advancing particles. A private base-frame builder now omits that unused output.
Public frame inspection still returns committed particles. In the same 120-step
C++ profile, mean presentation cost decreased from 10.55 to 6.51 ms. Mean total
native tick cost decreased from 30.19 to 27.89 ms. Remaining mean costs included
10.78 ms for scripts, 7.26 ms for checkpoints, and 6.51 ms for presentation. These
results remain above the 4 ms simulation guidance and establish no hardware
frame-rate claim.

The retained native-worker/WASM fixture also uses the same seeded BLACKSITE
sparks definition in both hosts. Across 90 ticks it compared 333 live samples
and 14,320 numeric fields under the particle paths, followed by the repeated
25-cycle reload/restore check. Discrete fields agreed exactly. The maximum
particle numeric difference was `2.78e-17`, within the declared tolerances, so
this establishes numeric agreement rather than bitwise floating-point identity.
All 25 measured WASM extents were 139,198,464 bytes. The descriptor build also
passed the existing 225 assertions in both Node and a Chromium module worker,
and repeated the separate bridge allocator-exhaustion recovery check.

Profiles, before/after frame hashes, source-range admission reports, and the
isolated profiling drivers are retained under
`/home/mg/.cache/native-final-tmp/blacksite-visual-parity/`.

### BLACKSITE controlled start comparison

The retained BLACKSITE fixture now includes a browser capture helper that uses
the production native browser renderer and verified asset broker. A fresh WASM
worker prepared seven models. It performed no session open, simulation step,
snapshot import, or legacy-runtime fallback. The bundle inventory rejects legacy
runtime modules. A deliberately mismatched frame and shared probe failed before
bundling or GPU startup. The fixture tests cover asset preservation, command
adaptation and baked camera/weapon hierarchy regressions.

The canonical renderer probe flattens entity parents after baking their world
poses. This corrected a doubled weapon transform in the first probe conversion.
The authored document retains its hierarchy. Six rebuilt probes preserved all
twelve saved legacy frame and particle files byte for byte. Their raw native
frame hashes were verified independently. The start frame hash is
`a79354891effb52e4246728e8e64e685b2ae585f1be9741f314ff4df56d48987`.
Both Qt and browser captures consumed that exact file. The legacy reference and
native browser reports identify the same shared probe hash,
`eff8d89e3b668027eecb9d65d9a8be8ddefa500f03e146463f38cbb6f224a708`.

The first aligned start checkpoint rendered the original rifle and optic,
facility, drone, lighting, effects and font HUD. The browser report recorded four
decoded model images shared by twenty-one references, four texture variants,
and the complete twenty-seven-primitive rifle. All twelve authored projectors
were dropped with explicit aggregate-triangle diagnostics, matching the legacy
reference's work-limit omissions. The visible floor texture difference remains
unresolved. This checkpoint does not establish whole-game visual parity.

At 1280 by 720, encoded-RGB whole-frame mean absolute error against the legacy
reference was 0.003940 for the native browser capture and 0.011992 for the initial
Qt capture. These are measurements, not acceptance thresholds. The initial Qt
capture predates the aggregate projector-cap correction. Both browser runs used
ANGLE Vulkan SwiftShader. No hardware performance claim follows from them.

Artifacts are retained beneath `/home/mg/.cache/native-final-tmp/`:

- `blacksite-visual-parity-closed-xzLgcE/controlled-flat/start-legacy.png`
- `blacksite-controlled-flat-start-browser-v2.png` and its `-report.json`
- `blacksite-controlled-flat-start-native.png` and its Qt report
- `blacksite-controlled-start-legacy-browser-metrics.json`
- `blacksite-controlled-start-legacy-qt-initial-metrics.json`

Reproduce with the retained fixture's `reference.mjs --render-reference-only
--view start` and `browser-capture.mjs` commands described in its README. Use
the same closed document, canonical frame and shared probe for each renderer.

A subsequent start-only native browser capture matched the legacy model
texture anisotropy policy. The reported driver capability applied to textures
was 16. The raw frame, assets and WASM pair were unchanged. Whole-frame mean
absolute error decreased from 0.003940 to 0.002154. In the fixed floor region
at pixels `[25, 460, 666, 144]`, it decreased from 0.012187 to 0.007403, with
root mean square error decreasing from 0.020989 to 0.016890. Residual differences
remain. The capture is `blacksite-controlled-flat-start-browser-anisotropy.png`
with its `-report.json`. Before, after and direct-difference measurements are
`blacksite-start-legacy-v2-metrics.json`,
`blacksite-start-legacy-anisotropy-metrics.json` and
`blacksite-start-v2-anisotropy-metrics.json` in the same cache root.

The next start-only capture also matched GLTFLoader's normal-map Y convention
for tangentless geometry. With the same canonical frame and asset bytes,
whole-frame mean absolute error against the legacy reference was
`1.134713144517066e-8`. Four pixels differed, with maximum channel error two
encoded byte values. The floor and rifle/optic regions matched exactly.
The report independently queried a maximum anisotropy of 16 from the actual
SwiftShader WebGL driver. This establishes that controlled start checkpoint,
not the other gameplay or transient states. Files are
`blacksite-controlled-flat-start-browser-normal-y.png`, its `-report.json`, and
`blacksite-start-legacy-normal-y-metrics.json`. The before/after convention
comparison is `blacksite-start-anisotropy-normal-y-metrics.json`.

All seven pinned legacy-reference and native-browser states were then captured
sequentially. Every pair verified the shared probe digest and exact raw native
frame digest before measuring pixels. The reports use the original material,
camera, environment, particle samples and UI values. No acceptance threshold was
introduced to absorb the remaining differences.

| Controlled state | Whole-frame mean absolute error | Changed pixels | Largest channel error in bytes |
| --- | ---: | ---: | ---: |
| Start | 0.00000001135 | 4 | 2 |
| Combat | 0.00000076735 | 130 | 30 |
| Extraction | 0.00000000993 | 7 | 1 |
| Muzzle and hit | 0.00000002411 | 8 | 3 |
| Drone explosion | 0.00000016312 | 11 | 36 |
| Reload and hover | 0.00000025389 | 24 | 14 |
| Damage feedback | 0.00000027091 | 53 | 16 |

Each image contains 921,600 pixels. Extraction rifle, HUD and banner regions
matched exactly. The damage image retains armor 90, the incoming-fire warning
and red damage feedback. Sparse transient differences remain, including an
explosion pixel at `[669, 362]` with a 36-byte channel difference. Their cause
has not been established. The complete metrics, paths and difference locations
are in `blacksite-visual-parity-closed-xzLgcE/controlled-browser-seven-state-results.json`
and `controlled-browser-difference-locations.json` beneath the cache root.

Separately, the retained `gameplay-frames.mjs` collector drove the original
583-tick route through the actual final-Session Release C++ worker. It checked
all four native assertions, including five kills at tick 223 and extraction
score 105 at ticks 557 and 583. All 292 authenticated same-session replay frames
matched. Collection and replay completed in 49.25 seconds under the unchanged
120-second host deadline. The final native frame contains 1,050 particles.
The collector preserved actual native frames at ticks 0, 5, 24, 70, 120 and 583,
with document, route, worker-binary and frame hashes in
`blacksite-final-native-gameplay/gameplay-evidence.json`. These actual gameplay
frames are separate from the legacy-pinned renderer comparisons.

Actual native frames at ticks 0, 120 and 583 were also captured through the
production browser renderer with the final staged WASM module. Each screenshot
report identifies `actual-native-cpp-gameplay-frame` as its origin and matches
the collector's exact raw frame hash. The final WASM digest is
`b3fa7f5689151df60169a87421e7262d3068ef0cc9b40c195133661ffc257daf`.
Each capture prepared all seven models through the fresh WASM importer. The
render-only capture page did not run another simulation or import a snapshot.
Files are `blacksite-final-native-gameplay/browser-0.png`, `browser-120.png`
and `browser-583.png`, with reports and `browser-actual-native-captures.json`.
The final actual native player position is approximately `[0, 0.8, -29.18337]`,
compared with `[0, 0.81, 7]` initially. No drone roots remain at extraction.

### Isolated Xvfb keyboard scratch workaround

Final native captures first failed before Qt started. The same `xvfb-run` with
`true` also exited 1. Explicit Xvfb stderr showed that `xkbcomp` could not close
`/tmp/server-0.xkm` because of the temporary-file quota. Keyboard initialization
then failed and `xauth` received an empty display number. Setting `TMPDIR` did
not change that X server scratch path. A compiler invocation independently
reported `Disk quota exceeded` when its scratch output used `/tmp`.

The approved workaround lives entirely in the capture cache. Prepend
`/home/mg/.cache/native-final-tmp/gui-wrapper-bin` to `PATH`. Its `Xvfb` wrapper
allocates a private cache directory and injects a narrow file-path shim into
only its own `/usr/bin/Xvfb` process and that server's `xkbcomp` children. The
shim redirects only exact `/tmp/server-<digits>.xkm` paths. It leaves unrelated
paths unchanged. No system configuration, quota, foreign file or human display
was changed. Qt and browser processes receive no preload library or redirect
variable. Every final Qt capture log asserts this before executing the real
binary.

The original failing `true` command passed with this wrapper, and all seven
native controlled captures then passed, including reload. The proof also
compiled the same unrelated text keymap with and without the shim and verified
identical bytes. An exact redirected scratch path was written and read in its
private cache directory while the literal `/tmp` path remained absent.

Artifacts beneath `/home/mg/.cache/native-final-tmp/` are
`qa-final-xvfb-startup.log`, `qa-xkb-redirect-proof.json`,
`qa-xkb-redirect.c`, `qa-xkb-redirect.so` and `gui-wrapper-bin/Xvfb`.
The wrapper SHA-256 is
`58109f036f32129dc850277edddc9449c0597925df9525819edd0e22eedda26d`.
The shim source SHA-256 is
`4de85dfd81f4d2ec1441ff3a89193ad5a6e725065fbfc747bd9e410a35ed3b26`.
The proof SHA-256 is
`5ddda4a128299ad95edbe5c25817959ab01ef3f684b31a9aea1f7d33421bc14b`.

### Final Qt matrix and actual gameplay

After the particle mesh-slot lifetime fix and BSDF corrections, all seven
controlled Qt captures passed with the unchanged canonical inputs. Reload,
which previously crashed, now completed. Every capture checked the exact raw
source-frame hash against the saved inventory. The new output directory
`blacksite-final-qt-complete-xkb` preserves the earlier failed and partial runs.

| Controlled state | Qt mean absolute error against legacy | Qt root mean square error |
| --- | ---: | ---: |
| Start | 0.006778 | 0.024716 |
| Combat | 0.006834 | 0.025214 |
| Extraction | 0.012245 | 0.035915 |
| Muzzle and hit | 0.006725 | 0.025492 |
| Drone explosion | 0.006605 | 0.024751 |
| Reload and hover | 0.006301 | 0.024649 |
| Damage feedback | 0.006838 | 0.023430 |

These encoded-RGB measurements do not establish pixel identity. The start
brand and objective HUD regions have errors 0.014235 and 0.012497, compared with
0.000544 in the upper extraction-field region. Font rasterization and
antialiasing differ between Qt and the browser. Surface differences also
remain: start floor and rifle/optic errors are 0.011174 and 0.014353. Rendering
precision, sky integration and texture/shadow filtering remain backend-specific
residuals. The region measurements do not prove a cause for every differing
pixel. No tolerance was increased to pass these images.

The final native Qt player then ran actual Sessions to ticks 0, 120 and 583
using the original input route. These are direct player captures, not the
renderer-only probe. All three passed `--verify-restore` and reported the
expected committed tick. Each resolved camera matched the independently
validated native worker state exactly. The final actual capture visibly shows
the extraction field, full rifle and optic, completion banner and ammunition
08. The Release player completed each capture under the unchanged 120-second
process deadline. Its SHA-256 is
`1fb97ec2c22b5c42ad38dd3c35d99d04eed87b08bfb49a297eb937808a98b9f8`.
The controlled renderer probe SHA-256 is
`d75798cc264c85a4893cc355e890fd3273ed134bbd9e9dd26644a501f8068349`.

Final Qt images are `blacksite-final-qt-complete-xkb/controlled-<name>.png` and
`actual-0.png`, `actual-120.png`, `actual-583.png`. Their capture reports,
binary hashes, clean child-environment assertions, canonical frame hashes and
region metrics are retained alongside them. The unified cache index
`blacksite-final-qa-index.json` includes source, route, worker, renderer,
WASM/module, asset-provenance and capture digests, plus every final image path.
Native-versus-legacy physics and cosmetic spawn-ID seed differences remain
separate from these controlled pixel comparisons. Audio mixing parity remains
outside this visual check. SwiftShader and llvmpipe results establish no
hardware frame-rate claim.

Final importer admission guards reject `COLOR_0` and normal-mapped primitives with explicit `TANGENT`, since the prepared vertex contract preserves neither channel. The focused Release asset test passes. After rebuilding the SDK 6.0.13 module, all seven closed BLACKSITE prepared-model JSON SHA-256 digests match the prior producer exactly (`final-guards-before.json`, `final-guards-after.json`, and `final-guards-digest-comparison.log` under the verification cache). Final Node and Chromium worker conformance each pass 225 assertions, global heap exhaustion recovers, and native-worker versus WASM parity passes 136,656 comparisons including 333 particle samples. The 25 lifetime cycles plateau at 139,198,464 bytes after the initial cycle and leave zero contexts. The staged module SHA-256 values are `7a0b7e1633e5ab3d946796c4a4bc33470a361bccf63fef00545e5c9123c0a11c` for JavaScript and `b3fa7f5689151df60169a87421e7262d3068ef0cc9b40c195133661ffc257daf` for WASM. Asset, response, heap, script, and deadline limits remain unchanged.

### Qt presentation feature checks

Frames with an admitted environment use the production `Scene3D` HDR pipeline.
Frames without one retain the established 3D renderer, and 2D frames use
`Scene2D`. Model color images decode to linear RGBA16F before interpolation and
mipmap generation. Normal images remain linear RGBA8. This avoids Qt's GLES
RGBA8 sRGB-flag limitation. GPU image caching uses content digest and color
space, with sampler state cached separately. The image allocation cap remains
256 MiB. Linear model samplers with mipmaps use the bounded 16-tap anisotropic filter.
Authored nearest samplers retain nearest sampling.

The focused checks are registered with CTest and selected by the native player
wrapper:

- `native-game-player3d-material` checks tangentless X/Y normal maps on rotated,
  nonuniform front and back surfaces on OpenGL and Vulkan.
- `native-game-sky3d-gpu` compares the day and night ray/roughness matrix against
  retained actual Three PMREM samples. It also checks finite atlas contents,
  cache reuse, reset and an intentionally invalid comparison.
- `native-game-player3d-anisotropic` compares the production grazing fixture with
  the retained actual GLTFLoader reference. Repeating the committed pose for
  120 measured frames preserves pixels and GPU resource counts.
- `native-game-player3d-particle-batches` retains the separated-run crash
  reproduction. `native-game-particle-mesh-lifetime` moves and reorders runs
  with the same emitter identities and vertex capacities in one renderer. Its
  OpenGL and Vulkan pixels update across frames while resource counts stay
  flat. The old emitter-keyed cache failed the reproduction and the original
  reload frame crashed at `QRhiCommandBuffer::setVertexInput`. Separate reusable
  draw-run slots fix both failures.

Run the player wrapper through the isolated display setup above. Render reports
separate scene, shadow and fullscreen work and expose total draw and triangle
counts. Software-renderer timing is not a hardware frame-rate result.


## Final visual aggregate checks and watchdog comparison

The `visual-verified` aggregate completed after the visual source freeze.
Typecheck and lint exited zero. The harness gate passed all 20 selected checks.
`test:affected` exited one on the legacy TypeScript `sprite-5` benchmark at tick
36, where the unchanged per-call 20 ms CPU watchdog fired. Its runtime suite
reported 90 passing files and one failing file. This failure prevents claiming
a completed final aggregate pass.

A controlled follow-up ran the benchmark file serially with the complete Node
24.22.1 installation and one test worker. The isolated HEAD checkout at
`4834b49ef14480620cfbd88d0d4a971a18c99b34` and the current tree each passed all
four tests with exit status zero. Each used its own built protocol package.
The script clock, script host, benchmark test and workload sources are identical
between the two trees. Logs are `visual-watchdog-baseline-benchmark.log` and
`visual-watchdog-current-benchmark.log` in the verification cache. The aggregate
failure's cause remains unresolved. The CPU threshold measures thread CPU as
well as wall time, so scheduler waiting alone does not establish its cause.
No production deadline or watchdog was changed.


## Separately staged native artifacts and Turbo cache

A production package build restored an older cached `native-game-worker` over
the final Release worker. The observed cached worker SHA-256 was
`e6e6a5a9c9de32e2d2245b2254f5904e5c0712243516620caafd8e0c77790698`,
while the staged final worker was
`8e827be57f9ac05129146825dc915e99b6ad9f2114d5f3033ead984f4a6b29fb`.
The runtime and renderer package build policies now exclude only their
separately compiled worker and WASM pair from cached outputs. Required compiled
JavaScript remains cached. The renderer hashes the staged WASM pair and SDK
version as inputs so its generated browser identity matches that pair.

The retained real-Turbo regression failed under the old policy when the cache
replaced freshly staged worker bytes. With the fixed policy, all seven focused
delivery tests passed. The fixture verifies preserved staged files, a renderer
rebuild after replacing pair A with pair B, and a same-pair cache hit restoring
deleted required JavaScript and the matching identity. It enumerates actual
`.tar.zst` members and asserts that none contain staged workers, module or WASM.
Logs are `native-cache-boundary-red.log`, `native-cache-boundary-green.log` and
`native-cache-boundary-focused.log`. Archive copies and their enumeration are
in `native-cache-boundary-proof/` beneath the verification cache. This cache
bug and fix do not explain or resolve the separate script-watchdog failure.


The post-cache-fix package build completed with exit status zero: 73 package
build tasks succeeded. The staged Release worker retained SHA-256
`8e827be57f9ac05129146825dc915e99b6ad9f2114d5f3033ead984f4a6b29fb`
after the build. The browser module and WASM retained the final hashes above.
The generated identity matches all five artifacts at their canonical sources,
including notices from the runtime scripts directory. Evidence is
`visual-cache-fixed-build.log` and `visual-cache-final-identity-audit.json`.

The first post-fix aggregate process exited 143 during script tests after all
22 native core tests passed. No failing assertion was reported before the
process ended. Its incomplete logs remain under `visual-cache-fixed-*`.
A detached replacement retains separate `visual-cache-final-*` logs. In that
replacement, game-runtime passed all 91 files with 857 passing tests and one
skipped test. Game-renderer passed 100 files with three skipped files, 602
passing tests and eight skipped tests. Existing watchdog limits were unchanged.
These package results do not establish the earlier watchdog failure's cause.


The completed `visual-cache-final` aggregate passed typecheck, lint and all
20 harness selfchecks. Its affected run stopped at two URL-egress inventory
assertions in the backend runtime suite. The new browser player's plain fetch
was missing a classification. The browser policy is now recorded in both
`packages/runtime/tests/url-egress-inventory.ts` and
[the reader-facing inventory](../url-egress-inventory.md). It documents the
operator-supplied static base, redirect rejection, canonical manifest asset
paths, response size and digest verification, browser credential defaults, and
the installed export's same-origin CSP. The classification does not claim that
the embedding API itself enforces a same-origin base. No fetch behavior or audit
assertion was weakened. The focused audit passes all 11 tests with exit status
zero (`visual-url-egress-audit.log`). The package build after this correction
also passed (`visual-inventory-final-build.log`).


The `visual-inventory-final` affected run passed the corrected backend runtime
suite: 251 passing files, one skipped file, 4,551 passing tests and 15 skipped
tests. It subsequently stopped in `packages/video-nodes` on
`timeline-browser-render.test.ts`, which compares the browser timeline compositor
with the Node compositor at ten timestamps. Mean difference was
0.027244001906318083 against the existing 0.02 threshold, with per-frame values
0.0263–0.0287. That package reported 59 passing files, one failing file and
494 passing tests. The threshold was not changed. Typecheck and lint completed
with exit status zero. The focused baseline/current investigation is separate
from native-game rendering evidence. This run does not establish a complete
aggregate pass.


The subsequent [Astra review record](native-game-cpp-astra-review.md) identifies
additional supported blockers in the previously unreviewed port. Earlier passing
checks do not clear those findings. Their fixes require regressions, fresh
Astra follow-up and final verification.

### Native lifecycle and cancellation recovery follow-up

The retained Astra worker probes reproduced outgoing scene destruction being skipped, dead behavior state remaining after despawn, and 2D cancellation exposing staged state after failed rollback. The original Release worker results remain in `/home/mg/.cache/native-final-tmp/astra-final-review/core-before-fix-repro.log`. Fresh coordinated `build-editor-check` outputs now commit outgoing destruction once, release dead state/timer/started records, and restore the complete trusted checkpoint with cancellation suppressed only during recovery. Function-form update scripts do not execute during destruction. Genuine rollback allocation failure invalidates the Session and evicts its dispatcher document and simulation resources.

Focused `native-game-session` and `native-game-session2d` CTests pass. After correcting the test expectation for the direct dispatcher throwing `not_found`, `native-game-bridge` passes too. The bridge test forces a real one-shot allocation failure during rollback, verifies snapshot/inspect/frame/step/restore/reload cannot access the evicted session, and reopens the same session ID successfully. It also verifies nested recovery scopes restore the cancellation callback after exceptions. Session regressions cover transition plus same-tick despawn, destruction failure rollback, function-script score/RNG replay, forty ephemeral entities returning checkpoint state to the live baseline, and cancellation after the first 2D behavior stages state and consumes RNG.

The exact original worker probes rerun against the fresh worker exit zero and independently assert transition score 7 without duplication, empty despawn state, and a `cancelled` response followed by an authenticated tick-zero snapshot without staged behavior state. Reports and assertion output are in `astra-final-review/core-after-fix/`. The shipped reference distinguishes the native transition lifecycle from the legacy TypeScript policy. `npm run check:agents-docs` passes. These focused checks do not replace the root mandatory checks or final portable rebuild.


## Post-Astra artifact verification

The fresh Astra follow-ups clear F3–F10 as recorded in
[the review evidence](native-game-cpp-astra-review.md). Final portable SDK 6.0.13
build and staging passed. The module remains
`7a0b7e1633e5ab3d946796c4a4bc33470a361bccf63fef00545e5c9123c0a11c`.
The rebuilt WASM is
`4df4eafe960044bf209cc3ae64bbdee4576f045ac4ab1948cb498b1ced11d6b0`,
superseding the earlier visual profile's WASM hash. Node and Chromium each pass
225 conformance assertions. OOM recovery, 136,656 native/WASM comparisons,
25 lifetime cycles and cache-only lifecycle C-interface reproductions pass.
The lifecycle probes report score seven and empty destroyed state, with no
function-form destruction update. All seven prepared model JSON digests remain
unchanged. Portable logs are `astra-final-review/portable-final-*`.

Release configure, the worker/player/editor/benchmark build and the fresh install
all completed with exit status zero. The editor-inclusive install is
`/home/mg/.cache/native-final-tmp/native-parity-final-install`. Its dependency,
QML/plugin and license audit is `final-release-closure-audit.json`. Installed
worker SHA-256 is
`529dbb1968e7f6ef57919ee60ef8676c3f9ba83e95be76cd06976ebbffbde4be`.
Installed player SHA-256 is
`acf102f9ac963f851dd898c0c5c90a0471b9c0da6a25eac781340a3226575944`.
Installed editor SHA-256 is
`483d213ada00c0956289527faef4107c3ae444afd373c5dc6e6016ac2684e6b6`.
Build and installed GUI hashes differ because deployment rewrites RPATH.

The subsequent package build passed all 73 tasks (`astra-reviewed-build.log`).
The staged worker retained the final Release hash after Turbo completed.
The explicit native/browser profile wrapper also completed with exit status zero
against this installed runtime and final WASM: 30 tests in nine files plus
semantic and normal/BSDF reference checks. The registered startup regression
ran rather than skipping. Its first completed frame has the declared font
loaded, visible HUD and model pixels, an empty error status and closed local
requests. Evidence is `astra-reviewed-native-browser-gate.log`, its summary JSON,
and `native-player-startup-2Sc59H/report.json`. Browser normal-map and BSDF
reference comparisons report zero difference. These software-renderer results
make no hardware frame-rate claim.

The separate timeline failure was reproduced on both prepared HEAD and current
checkouts, with bit-identical mean 0.027244001906318083 and all ten per-frame
measurements. The baseline timeline package was built first and both tests
exited one using the same Node, Chromium and FFmpeg. Logs are
`timeline-parity-baseline-build.log`, `timeline-parity-baseline.log` and
`timeline-parity-current.log`. The mismatch therefore predates this port on this
host. Its lower-level pixel cause is not established. No threshold was changed.

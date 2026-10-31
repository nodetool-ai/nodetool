# Native game runtime

The native runtime follows [the C++ port plan](../../docs/plans/native-game-cpp-port.md).
The document and simulation libraries run without Qt. The desktop player adds
Qt Quick rendering and offscreen capture. The Qt editor shares document transactions.
The worker reports only the operations it implements.

## Authored 3D presentation

The opt-in `scene.environment` contract implements the BLACKSITE-used subset of
the legacy presentation surface. It requires enabled post-processing with explicit
AgX tone mapping and SMAA. Bloom runs before exposure, AgX and sRGB conversion,
followed by vignette and SMAA. Bloom softness controls the high-pass transition
width. Documents without an environment retain the established fixed native
renderer.

The admission bounds are defined in
[native-game-presentation.ts](../../packages/protocol/src/native-game-presentation.ts).
Supported environments use color or procedural skies, height fog, directional or
point lights, and fixed perspective cameras. Lights are bounded to 32, with four
local shadow casters. Shadow maps use 512, 1024 or 2048 pixels and directional
cascades use two to four splits. Unsupported sky modes, spot lights, other
antialiasing modes and orthographic or follow cameras fail admission.

Presentation includes supported material maps, resolved animation, decals and
bounded particle samples. Particle state participates in authenticated live-session
restore and failed-tick rollback. It is not a durable whole-world save format.
HUD widgets support panels, text and bars with admitted fonts and explicit
presentation dimensions. UI images are not admitted.

Post-processing rejects targets beyond its 512 MiB texture budget. Its verified
SMAA lookup tables ship inside the browser bundle and Qt resources. No CDN is
required. [Lookup provenance and regeneration](assets/SMAA.md) records the pinned
implementation and licenses.

## Build and verify

Requires CMake, a C++20 compiler, Python 3, and network access for the pinned source
archives on the first configure. Run from the repository root:

```bash
node scripts/check-native-game.mjs
```

For focused document/worker work, disable the dependency probes:

```bash
cmake -S native/game -B native/game/build -DCMAKE_BUILD_TYPE=Debug -DGAME_BUILD_DEPENDENCY_PROBES=OFF
cmake --build native/game/build --parallel 2
ctest --test-dir native/game/build --output-on-failure
```

Add `-DGAME_SANITIZERS=ON` in a separate build directory for ASan/UBSan. Dependency
probes and archive pins are described in [dependencies.json](dependencies.json).
[Probe instructions](probes/README.md) include the Qt-free WebAssembly build.
Generated schemas are embedded at configure time, so a packaged worker does not
read the source checkout. Reconfigure after regenerating schemas.

## Documents and transactions

The canonical contract is
[protocol/native-game.ts](../../packages/protocol/src/native-game.ts). Documents
use engine `native-cpp-1`, schema version 4, and dimension `3d`. Validation applies
defaults, rejects unknown fields, checks references and hierarchy/prefab cycles,
and requires normalized quaternions and workspace-relative asset paths.

Transactions apply typed operations to a candidate and commit once after complete
validation. Revisions increase on edits, undo, and redo. Undo/redo retain at most
64 document states within an 8 MiB history budget. Normalized documents are
limited to 4 MiB. Inverse operations currently use a validated document
replacement, preserving the document identity and assigning the next revision.
The worker edits drafts. NodeTool's host owns durable save and authorization.
A save supplies the durable base revision and a newer draft revision. Edits,
undo, and redo may advance the draft several times before a save. Persistence
compares the durable base and preserves the accepted draft revision. Retrying a
save succeeds only when the candidate exactly matches the committed document.

Prefab resolution preserves each instance as an anchor. Template entities become
children with namespaced runtime IDs and preserve their authored local transforms,
properties, and behavior definitions. Instance properties belong to the anchor.
They do not implicitly overwrite template properties. Typed `prefabOverrides`
address direct template entity IDs, shallow-merge properties, and replace supplied
name, transform, behaviors, and asset references. Identity and hierarchy cannot be
overridden. Override targets and resource references are validated before commit.

## Worker protocol

`game-worker` reads unsigned big-endian 32-bit lengths followed by MsgPack objects.
Frames are limited to 16 MiB. Stdout contains framed responses only. Stderr contains
diagnostics. Requests use protocol version 1 and a bounded request ID.

Supported operations are `hello`, `validate`, `open`, `inspect`, `transaction`,
`undo`, `redo`, `close`, and `cancel`. `open` takes a document and session ID.
`transaction` takes session ID, expected revision, and operations. `undo` and
`redo` take session ID and expected revision. `cancel` takes `targetRequestId`.
Mutation requests execute serially while the input reader accepts cancellation.
A cancellation received before commit leaves the document unchanged. Cancellation
received after commit cannot reverse an accepted edit.

Responses contain `protocolVersion`, `requestId`, and either `status: "ok"` with
`result`, or `status: "error"` with a structured error. Conflict errors include
`currentRevision`. `hello` advertises engine identity, schema version, frame budget,
and supported capabilities. Gameplay operations require `start` before stepping or reading simulation state.

Successful requests and document operation failures are deduplicated by request ID
and exact request payload within a worker cache bounded to 64 entries and 16 MiB. The host must resolve durable retries through its
revision record rather than relying on this transient cache.

## Verification coverage

CTest exercises generated-schema admission fixtures shared with TypeScript,
atomic edits, revision conflicts, undo/redo, cloning, reference checks, cyclic
hierarchies, prefab expansion, a large hierarchy, framed worker requests,
idempotent retry, and malformed/truncated/oversized frames. No test here establishes
GPU performance or desktop packaging support.


## Simulation through the worker

After `open`, call `start` with `sessionId` and an optional integer `seed`.
`step` consumes one fixed simulation tick and accepts an optional input frame.
`frame` reads the committed presentation frame. `snapshot` returns engine-specific
simulation state. `restore` accepts that snapshot and publishes a new presentation
generation. Snapshots are authenticated for their originating live session. They cannot
restore into a new worker or a restarted session. An incompatible, foreign, or
invalid snapshot fails without replacing the active session. Worker recovery
reopens the durable authored document. Durable player progress uses a separate
save contract, rather than this session checkpoint format. `reload` validates replacement source before restarting the simulation.

Scripts request storage with `{ kind: "save", scope, slot, data }` or
`{ kind: "load", scope, slot }`. Scope defaults to `progress`. `settings` uses
separate slots. Data is a JSON object with a script-defined version, bounded to
16 KiB, 256 keys and depth 16. Each scope allows 16 slots. There is no snapshot
option. A committed frame exposes at most four ordered `hostRequests`, identified
by generation, tick and sequence. Failed ticks expose none. Completed loads reach
a later recorded `input.loaded` frame, at most two per tick. Restore and restart
discard undelivered results from the old generation.

The Qt player writes versioned JSON records atomically on a bounded IO worker
below its application data directory. The namespace includes the full game ID and engine contract. Storage
failures appear in its `jsonSaveStorage` report. Editor play uses temporary memory
and clears it when play restarts. Headless runs use memory unless supplied a
storage adapter, and report `storagePersistence`. Replays consume recorded load
results without storage IO. Pass `--replay-saves` when replaying input through the
Qt player. Authenticated simulation checkpoints remain restricted to their
originating live session.

QuickJS behaviors use explicit JSON state. Commands, timers, and seeded randomness
commit with the tick. A failed behavior does not publish its staged commands.
Each distinct source keeps one realm for the session, and the source expression is
evaluated again on every call. The global object and all builtins are frozen, so
global writes and prototype changes do not persist between calls. In sloppy mode,
an assignment to an undeclared name is ignored. Instances can still override inherited
members such as `name`, `message`, and `toString`.
The host preserves structured source diagnostics in `NativeGameWorkerError.details`
alongside the error code and document path.

A source expression evaluates to a function accepting `input`, or an object of
lifecycle hooks. Mutate `input.state` or return `{ state, commands }`. Commands may
also be emitted with `command(value)`. `input.world.get(id)` supplies an immutable
entity view and `input.world.query(query)` requests a next-tick result. Both
`input.random()` and `Math.random()` use the session's seeded random stream.

Named timers use `after(ticks, name)`, `every(ticks, name)`, and
`cancelTimer(name)`. The name identifies a method on the lifecycle object. Timer
state is part of snapshots. `log(...)` writes bounded script diagnostics. Hooks
are synchronous and run at the fixed simulation tick. Render frequency does not
invoke gameplay hooks. Async results and unsupported host access fail explicitly.


## Player and offscreen capture

The player requires the pinned Qt Quick and ShaderTools development modules.
Configure the Qt prefix through `NODETOOL_GAME_QT_PREFIX` or `CMAKE_PREFIX_PATH`.
The core check explicitly disables the player. Run its separate check on Linux
with an X server and a Vulkan adapter:

```bash
NODETOOL_GAME_QT_PREFIX=/path/to/qt/6.12.0/gcc_64 \
QSG_RHI_BACKEND=vulkan QT_QPA_PLATFORM=xcb \
xvfb-run -a node scripts/check-native-game-player.mjs
```

The player check uses `native/game/build-player` and fails when Qt or its labelled
player tests are unavailable. Its capture path shares the interactive viewport's
draw implementation. A software Vulkan adapter can establish rendering correctness,
but does not establish a hardware frame-time budget.

The `native-game-player` harness is marked expensive because it needs Qt and a
graphics device. Run the gate with `--expensive` to include it. The dedicated
[Native game workflow](../../.github/workflows/native-game.yml) provisions Qt,
Mesa Vulkan, and Xvfb and runs the player check for changes to native game code.

## Agent creation and command line

Use `nodetool game native` for `native-cpp-1` documents. Run `schema` to read
schemas and generated QuickJS declarations, then `create <directory>` for a
bundled obstacle course with a collectible, moving platform, gate, finish action,
HUD, and owned audio. The source scripts are ordinary document fields and can be
replaced through typed transactions. Invalid source edits leave the revision
unchanged.

The registered `native_cpp_game_*` agent tools use the same document operations,
authorized persistence, simulation, and capture services. They expose bounded
inspection, source chunks, staged asset installation, assertions, and replay.
Transport sessions stay inside the host. The CLI's `editor` operation uses the
live editor's user-local socket to share revisions with human edits.

See [native CLI commands](../../docs/cli.md#nodetool-game-native) for exact flags.
The benchmark's `host-roundtrip-ms` metric includes IPC and JSON transport. It
must not be compared directly with an isolated physics or GPU measurement.

## Browser runtime and static export

Build with the Emscripten version in [browser/emsdk.version](browser/emsdk.version):

```bash
node native/game/browser/build.mjs --sdk /path/to/emsdk --build-dir /tmp/game-wasm --output-dir packages/game-renderer/dist
npm run build:packages
nodetool game native export ./course/game.json --target web --assets-dir ./course --out ./browser-player --json
```

The browser profile ships the native module, WASM, worker, player, artifact
identity manifest, and notices through the package asset registry. An installation
without that profile returns a capability error. Desktop remains the default
export target. Browser play uses the native simulation and the same dimensional
document routes as desktop.

Serve the complete exported directory over HTTPS or localhost HTTP. Asset hash
verification needs the browser's secure-context Web Crypto API. `file:` URLs cannot
load module workers. Browsers need WebAssembly, module workers, and WebGL2.
Audio requires a gesture. Playing uses local files only and needs no
NodeTool process, SDK, provider key, or external CDN. The page's Content Security
Policy allows same-origin workers, fetches and scripts with `wasm-unsafe-eval`,
and blob URLs for decoded media. A stricter hosting policy must preserve those
capabilities. Startup failures appear in the status element with serving and
browser guidance.

Export refuses an existing destination. It checks runtime identity and prepared
asset hashes, validates document semantics and QuickJS source through the installed
WebAssembly dispatcher, stages into a sibling directory, verifies written bytes, and
publishes by rename. Cancellation or failure removes staging. Keep all files
listed in `bundle.json` together when uploading to static hosting.
Browser exports allow at most 4096 prepared assets, 64 MiB per asset, and
256 MiB of asset bytes in total.

Run `node scripts/check-native-game-browser.mjs` after building the browser
profile. It rejects invalid artifacts, requires nonempty fixture discovery,
plays both dimensions from static files, checks the closed request set, and
captures screenshots and gzip/startup reports under the configured temporary
directory. Software rendering establishes correctness only.

Append `?benchmark=1` to opt into canvas CPU and GPU synchronization for
measurements. Normal play keeps that synchronization disabled. Completion timing
excludes the DOM compositor and display and is not isolated GPU timing.
Append `?record=1` to retain bounded input history for replay. Normal play retains
no input history. A recording limit stops recording explicitly rather than
discarding earlier inputs.

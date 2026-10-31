# Relay Yard native port

This fixture ports `packages/game-runtime/samples/relay-yard/game.json` to
`native-cpp-1`, schema 4, Jolt and QuickJS. The web source remains unchanged.
The adapter retains all 44 source entities and 41 visuals. Dotted IDs use a
reversible hex mapping recorded in `provenance.json`, with collisions rejected.

The three original script bodies remain verbatim inside one native controller,
with separate role states and explicit command owners. Its bindings adapt entity
positions, input edges, kinematic targets, respawn and the six HUD commands.
They do not run the legacy TypeScript engine. Camera and trigger work share the
same guest call, reducing native behavior invocations from eight to one per tick
without increasing the existing 16-command bound.
The moving-platform formula and source gate/checkpoint/respawn state are retained.
The crate keeps its authored mass of 8.

Collectibles use native scoring/despawn with sensor masks that admit only the
player layer. The controller first requires both authored cells to exist, then
tracks their actual disappearance after physics. Only the course's native
collectible gameplay removes them. It never awards synthetic score. Trigger
adapters also require an entering player contact. A crate overlapping either cell
or switch must neither score nor open the gate. The runner exercises both
negatives with real Jolt. Emitted triggers reach the original source roles on
the next tick, rather than being delivered immediately inside the controller.

Two nonvisual helpers preserve the switch's collider offset and the camera
orbit pivot. The camera remains parented to the committed player pose. A rotating
pivot moves its offset, while the camera's relative quaternion keeps it looking
at the authored target offset. Drag orbit and camera-relative forward movement
are tested. There is no renderer-only camera override.

The native canonical capsule has different proportions. A generated closed,
geometry-only GLB preserves the original Three CapsuleGeometry instead. It has
306 vertices, 1,632 indices and no external dependencies or images. Its source
position/index hashes are pinned in `adapt.test.mjs` and recorded in provenance.
Native Qt capture admits and renders this model.

## Reproduce

Use the repository's Node version and built dependencies. Set `TMPDIR` to an
approved writable cache directory, and configure the installed worker/player:

```bash
export NODETOOL_NATIVE_GAME_WORKER=/path/to/install/bin/game-worker
export NODETOOL_NATIVE_GAME_PLAYER=/path/to/install/bin/game-player
export RELAY_OUT="$TMPDIR/relay-yard-native-qa"
node --conditions=nodetool-dev --import=tsx --test native/game/tests/fixtures/relay-yard/adapt.test.mjs
node --conditions=nodetool-dev --import=tsx native/game/tests/fixtures/relay-yard/adapt.mjs "$RELAY_OUT"
node --conditions=nodetool-dev --import=tsx native/game/tests/fixtures/relay-yard/run.mjs \
  --document "$RELAY_OUT/game.json" --worker "$NODETOOL_NATIVE_GAME_WORKER" --out "$RELAY_OUT"
node --conditions=nodetool-dev --import=tsx native/game/tests/fixtures/relay-yard/capture.mjs \
  "$RELAY_OUT" "$NODETOOL_NATIVE_GAME_PLAYER"
```

The same six adapter regressions are registered with CTest. After configuring
the native build, run:

```bash
ctest --test-dir "$NATIVE_GAME_BUILD_DIR" -R '^native-game-relay-yard-fixtures$' --output-on-failure
```

Linux capture uses Xvfb, xcb and the installed Qt 6.12 Vulkan renderer. It removes
an inherited `DISPLAY` and `LD_PRELOAD` from the child environment. The output
contains the native document, capsule GLB, source/asset hashes, worker validation,
real frames, assertions, PID metadata and 1280×720 screenshots. No browser or
legacy renderer is used. Software captures prove appearance, not hardware FPS.

`completion.inputs.json` preserves the source's 165 movement frames. Native
assertions are in `completion.assertions.json`, rather than copied legacy player
positions. The observed native milestones are cell one at tick 54, gate open at
82, checkpoint at 112, cell two at 149 and win at 150. The earlier multi-call
profile emitted win at 151 because it needed an additional destruction-event
notification hop. The consolidated controller intentionally removes that hop.
The runner compares all 83 continuation frame digests after a same-session
midpoint restore.
Separate probes exercise grounded/held jump, yaw-relative keyboard movement,
drag orbit, R respawn, walking off the yard, platform motion and crate negatives.

To prove the crate negative is sensitive, append
`--witness-unfiltered-sensors` to the runner, using a separate `--out` directory.
It deliberately admits crate contacts and must exit nonzero when the crate
collects a cell. It does not modify the generated game or the normal route.

## Fidelity limits

The admitted native APIs cannot reproduce the source camera's radius-0.2 sphere
occlusion sweep. The default finish view can be occluded by the raised gate.
The original `finish.png` retains that result. `finish-orbit.inputs.json` adds
one real look-only input after completion, and `finish-orbit.png` shows tick 166
from that recorded continuation, with score and completion state preserved.

Source background, ambient light, sun, shadows, materials and projection are
retained. Native authored environments require explicit AgX/SMAA, while the
source used implicit legacy tone mapping. The asset-free source did not bind a
font, so native Qt uses its default font and can look heavier than the retained
web screenshot. This port does not claim pixel identity or full camera parity.

Jolt replaces Rapier controller internals. Speed, acceleration intent, jump,
slope and step settings are mapped, but exact ground snapping, coyote time,
jump buffering, platform carry, per-body CCD, damping and friction/restitution
are not asserted. The native route's actual state and replay establish the
tested gameplay. No engine features or physics implementation are changed.

The installed Release idle simulation benchmark was run separately with
`game-bench game.json --ticks 240 --warmup 60 --max-p95-ms 4`.
The initial eight-call profile failed with exit 2: total tick p95 was 11.595 ms
and script p95 was 9.137 ms. Its document, source and evidence are retained under
`before-consolidation/` in the output directory. One bounded controller
consolidation pass reduced total p95 to 6.273 ms and script p95 to 3.733 ms.
It still fails the unchanged 4 ms budget with exit 2. This measures idle input
with scripts and the moving platform active, not the completion route or player
FPS. The current report is `idle-bench.json`. The functional port passes its
gameplay checks but does not claim the tick-performance target.

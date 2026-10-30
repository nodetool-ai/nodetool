---
name: native-game-performance
description: "Measure and improve web and native C++ NodeTool game performance: frame and tick targets, budgets per game type, the authoring rules that set engine cost, and the measure-fix loop with nodetool game bench, capture and perf. Load before building a 3D game, at every build milestone, and when a game stutters, drops frames or runs slowly."
---

# Native game performance

## Native C++ measurements

For `engine: "native-cpp-1"`, use `native_cpp_game_bench` to measure simulation
with recorded input and warmup, and `native_cpp_game_capture` to inspect the
native QRhi result. These tools use C++/QuickJS with Jolt for native 3D or the swept AABB solver
for native 2D. The legacy web
benchmarks below measure a different implementation.

Keep seed, document revision, prepared asset manifest, tick count, and input route
with the report. Verify replay inside the same live session. Measure script
execution, physics, checkpoints, asset loading, and rendering separately when the
installed native capabilities provide those timings. A simulation benchmark alone
does not establish player frame rate. Software Vulkan captures establish visual
correctness and must not be reported as hardware performance.

Bound scene population, behavior commands, state, timers, and queries. Use targeted
world lookups rather than scanning the whole world in every behavior. Visual
animation cannot drive physics transforms. Diagnose the measured subsystem before
reducing visual quality or changing gameplay.


A game is done when it holds its frame target on the slowest machine it ships
to. Measure at every milestone. A number from a tool decides, not a look at the
editor.

## Targets

- The simulation ticks at 60 Hz. Tick p95 stays at or under 4 ms
  (`performance.budgets.tickMs`, default 4). That leaves the rest of each
  16.6 ms frame to rendering.
- The player renders at the display rate. On the slowest target Mac, frame p95
  stays within 16.6 ms for a 60 Hz display and within 8.3 ms for a 120 Hz
  display (`performance.budgets.frameMs`, default 16.6). Set `frameMs: 8.3`
  when the game targets ProMotion displays.
- Shader programs stay flat during play. Growth means a material switches its
  program variant every frame, which costs more than any draw.

Set the time budgets with the other budgets:
`edit_native_game {game_id, ops: [{op: "set_performance", performance: {budgets: {tickMs: 4, frameMs: 8.3, drawCalls: 400, triangles: 2000000}}}]}`.
`set_performance` replaces the whole `performance` object, so send
`cullLayers` again when the game has them.

## Budgets per game type

Starting budgets for the slowest target Mac. Draw calls and triangles count
every pass: the scene, each shadow cascade and the soft-particle depth pass.

| Budget | Arena | Platformer | Open 3D world | Flight or driving |
|---|---|---|---|---|
| Draw calls per frame | 300 | 300 | 500 | 500 |
| Triangles per frame | 500k | 500k | 2M | 3M |
| Shadow cascades | none, one map with `extent` | 2 | 3 | 3 |
| Cascade `maxDistance` | — | 60 to 120 | 300 to 800 | 1000 to 2000 |
| `shadows.mapSize` | 1024 | 1024 | 2048 | 2048 |
| Live particles | 1000 | 1000 | 2000 | 4000 |
| Soft emitters (`softness > 0`) | 1 | 2 | 4 | 4 |
| Collider triangles (all trimeshes) | 5k | 20k | 50k | 20k |
| Script behaviors | 1 to 5 | 1 to 5 | 10 | 1 to 3 |
| Active entities in a scripted scene | 300 | 300 | 1000 | 300 |

RIDGELINE, the shipped flight showcase, measures 380 draw calls, 2.9M
triangles, about 4000 particles, a 13.5k-triangle collider and 3 scripts.

## Authoring rules

Each rule removes work the engine repeats every frame or every tick.

- **`castShadow: false` on terrain and ground.** Every casting mesh draws again
  into each cascade, and ground still receives shadows. In a scene with
  cascades, validation warns with `large_shadow_caster` on a casting mesh 100
  units or wider.
- **2 or 3 cascades with a real `maxDistance`.** Each cascade is another pass
  over every caster inside it. A `maxDistance` far beyond what the player sees
  spreads the map over kilometres and makes nearly everything a caster.
- **Merge repeated props.** The engine does not instance: each model entity is
  its own draw calls and its own cloned materials. Bake trees, rocks and fence
  posts into a few merged models.
- **Split large meshes into chunks** of a few hundred metres. The renderer culls
  whole meshes, so one huge terrain mesh always draws in full, in every pass.
- **Use a reduced collision mesh.** The physics world is copied and restored
  every tick to keep replays exact, and that copy grows with collider triangles.
  Build a decimated `triangleMesh` collider, never the render mesh.
- **Use one controller script.** Each script call pays realm setup and JSON
  transport. One script that drives many entities costs less than one script
  per entity. Read the world with `world.get` and `world.query` with `near` and
  `radius`. Reading `input.world` serializes every active entity (1 MiB limit).
- **Send `setProp` and `ui` commands only when the value changes.** Props travel
  in the script input and the snapshot. A changed HUD value repaints the whole
  HUD canvas and uploads it as a texture. Round a speed or altitude readout so
  it changes a few times a second.
- **Keep the sun still under a procedural sky.** The sky cube and its
  environment map rebuild whenever the sun direction changes. A day cycle that
  turns the sun every tick rebuilds them every tick.
- **`presentation.hudWidth` is the render resolution.** The exported player
  sizes the 3D canvas to `hudWidth` by `hudWidth / aspectRatio`. Every
  full-screen pass scales with it. 1280 is enough for most games.
- **Bloom costs a mip chain.** Bloom adds a bright pass and five blur levels at
  full resolution. Keep `threshold` high so only real highlights bloom, and
  leave vignette, `fxaa` and `smaa` off unless the look needs them.
- **Keep soft particles tight.** `softness` makes the renderer draw scene depth
  once more for every geometry near any soft emitter. Set it only on emitters
  that touch geometry, and keep those emitters small.

## The measure-fix loop

Run this loop at every milestone: after the blockout, after the art pass, after
the effects pass, and before you report the game as done.

1. Record a route. A route is a JSON array of input frames, one per tick:
   `{"pressed": [], "justPressed": [], "axes": {"throttle": 1}, "look": {"x": 0, "y": 0}}`.
   It must reach the busiest moment of play: the most enemies, particles and
   scenery in view. An idle start screen measures nothing.
2. Measure the tick:
   `nodetool game bench game.json --inputs route.json --warmup 600 --ticks 600 --fail-on-budget --json`.
   It reports `tickMs`, `scriptMs`, time per system, physics counts and sampled
   allocation bytes per tick.
3. Measure the busiest frame's counters:
   `nodetool game capture game.json --ticks <busiest tick> --inputs route.json --out frame.png --fail-on-budget --json`.
   Read `stats.drawCalls`, `stats.triangles`, `stats.programs` and
   `budget.overruns`. `stats.renderMs` is CPU submission time only.
4. Measure real play on the GPU:
   `nodetool game perf game.json --inputs route.json --seconds 10 --fail-on-budget --profile play.cpuprofile`.
   It exports the game, replays the route, resumes live play and reports frame
   time p50/p95/p99, fps, draw calls, triangles and shader program growth.
5. Fix the largest cost first, then measure again with the same route. Stop when
   all three commands exit 0.

A 2D game runs step 2 only: `game capture --fail-on-budget` and `game perf`
measure 3D games. Each command takes a game document JSON or a shipped example
file, and
`--assets-dir` for installed media named `<full-asset-id>.<extension>`.
`game perf` uses uncapped frames, so its frame time is the real cost of a frame
on this machine. `--software` runs without a GPU, and its times say nothing
about hardware.

### Reading the counters

- Tick over budget: compare `perSystemMs`. High `scripts` points to script
  count, `input.world` reads or props. High `character` or `physics` points to
  collider size.
- Draw calls over budget: count casting meshes and cascades first, then
  repeated props.
- Triangles over budget: shadow passes multiply triangles. Turn off
  `castShadow` on large meshes and lower the cascade count before you simplify
  models.
- Frame time over budget with counters in budget: halve `hudWidth` and measure
  again. A big drop means the frame is fill-bound (resolution, bloom, soft
  particles). No drop means the frame is CPU-bound.
- Program growth above 0: a material or light changes every frame. Look for
  lights added, removed or toggled during play, and materials swapped per frame.

### Reading a profile

`game perf --profile` lists the functions with the most self time and flags
suspects. In steady play, renderer time belongs in `renderBufferDirect`,
`setProgram` and `projectObject`. Each of these in steady play is a bug:
`getProgram` or `getParameters` (a program rebuilt each frame), `traverse` with
a large share (a scene walk each frame), `takeSnapshot`, `JSON.stringify` or
`structuredClone` (a serializer in the frame or tick). Report it with the
profile path, then fix the authoring cause or the engine.

## Without a shell

Inside NodeTool there is no tool that times frames. Apply the budgets and
authoring rules, set them with `set_performance`, and check counts by reading
the document with `get_native_game {game_id, view: "full"}`. Give the user the
`nodetool game perf` command for the game, and when they ask for an export,
build it with `build_native_game`.

## Editor numbers

Editor play runs slower than the exported player. It inspects the session every
tick, copies state into the editor panels, and draws selection outlines and
debug views. Judge performance on the export with `game perf`, never on editor
fps.

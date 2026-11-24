---
layout: page
title: "Game Testing and Replay"
permalink: /developer/game-testing
description: "Run native games headlessly with the CLI, replay recorded input, verify snapshots, and measure tick and frame cost."
---

A native game runs the same way without an editor. The simulation advances in fixed 60 Hz ticks from a seed and a list of input frames, so the same inputs produce the same game. The CLI uses that to test games in scripts and CI. Flags for every command are in the [CLI reference](/cli#nodetool-game).

## Deterministic simulation and snapshots

A game session is a function of the document, the seed, and the input frames. Rendering, sound mixing, and particle effects are presentation. They do not feed back into the simulation.

A snapshot records the gameplay state at the end of a tick: scene, tick number, random state, score, entity state, script state, timers, HUD and UI overrides, and animation graph state. A session can resume from a snapshot and continue identically.

- Restoring checks that the snapshot belongs to the same game. 2D snapshots must match the document revision and engine version. 3D snapshots also check a digest of the document and the physics build. A snapshot is not a migration format, so a snapshot from a changed document is rejected.
- Script state keeps the property order of the JSON the script returned. A script can observe that order with `Object.keys`, so two states with the same keys in a different order count as different.
- Older 3D snapshots that hold a removed instance still waiting for its `onDestroy` hook identify the script source ambiguously. Restoring one fails with an error instead of guessing which scene or prefab hook to run.
- The 3D physics build identifier includes the runtime's stepping revision, so a snapshot from an earlier revision is rejected instead of replayed under changed collision behavior. Restoring also compares entity handles, native object counts, body poses and velocities, collider parents, and primitive shapes against the saved entity state.
- Particles, mixer graphs, and render resources are not part of a snapshot. The player rebuilds them from the restored session.

## Replay recordings

An input recording is a JSON array with one frame per tick, for example `{ "pressed": ["right"] }`. Frames after the end of the array are empty.

Load results from script `load` commands are recorded on the input frame as `loaded`. A replay delivers those recorded results without reading storage, so a recorded run does not depend on the saves that existed when it was recorded. To give a headless run its own save data, pass `--saves` to `simulate`. Saves stay in memory.

## Check a game from the command line

```bash
nodetool game validate game.json --json
nodetool game simulate game.json --ticks 1200 --seed 1 --inputs route.json \
  --assets-dir game-assets --expect-win --verify-replay --json
nodetool game capture game.json --ticks 60 --out frame.png
nodetool game bench game.json --inputs route.json --fail-on-budget
nodetool game perf game.json --inputs route.json --fail-on-budget
nodetool game smoke game-build --json
```

Choose a tick count and input file that finish your game. Every command exits non-zero when its check fails.

- `validate` checks the document. Read the diagnostic path and fix the field it names.
- `simulate` runs the ticks without a renderer. It can compare the final score or win state (`--expect-score`, `--expect-win`) and check entity positions, active state, and ordered events at chosen ticks (`--assertions`). The assertion file has `{ "tolerance": 1e-9, "ticks": [...] }`, where each entry has a `tick`, and optionally `sceneId`, `entities` (`id`, `x`, `y`, `active`), and `events`.
- `--verify-replay` resumes a second session from a snapshot at the midpoint of the run and compares its events and snapshots against the original tick by tick. A mismatch is reported with the tick and the first path that differs.
- `capture` renders one frame to PNG. 2D uses `canvas2d` or `webgpu`, and 3D uses WebGL2 in headless Chromium. Missing required assets or an unavailable Chromium produce an error. With `--fail-on-budget` a 3D capture fails when the frame exceeds a draw call, triangle, or particle budget.
- `bench` runs the simulation headless and reports tick, script, and per-system time as p50, p95, and p99, plus sampled allocation. Supply a route with `--inputs` so it measures play and not an idle game. `--fail-on-budget` fails when tick p95 is over `performance.budgets.tickMs` (default 4 ms).
- `perf` is 3D only. It exports the game, plays it in headless Chromium, and reports frame time, draw calls, triangles, and shader programs. It fails over `frameMs` (default 16.6 ms) and the count budgets. Software rendering (`--software`) times do not describe real hardware, so measure on a GPU.
- `smoke` renders 300 scripted frames from an exported web player folder and fails on player errors.

No command covers keyboard and gamepad input or audio. Check those in browser play.

## Regression fixtures

Keep a fixture for each bug you fix.

- Store the document, the seed, the input recording, and the assertions together, and run them with `simulate`.
- Record routes that include falling, recovery, repeated actions, and scene transitions as well as the winning path. Reaching the objective once does not show that recovery or restoration works.
- Add `--verify-replay` to routes that use saves, timers, or spawned entities.
- Capture selected ticks to check what the player sees. Pin pixel comparisons to one renderer, because software and hardware output differ.
- When you measure cost, keep the same document, route, tick count, and renderer between runs so the numbers compare.

The test suites in `packages/game-runtime/tests` and `packages/cli-game/tests` use the same pattern, including recorded routes, snapshot restoration, and golden frames.

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

## Bots and seed sweeps

A recorded route proves that one path works. A bot plays the game itself, so a sweep over seeds shows that the game can be won, that a weak player loses, and that a session ends in time. Bots run in `simulate` for 2D games.

```bash
nodetool game simulate game.json --ticks 3600 --bot 1 --bot-file bot.js --seeds 8 --expect-win
nodetool game simulate game.json --ticks 3600 --bot 0.25 --bot-file bot.js --seeds 8 --expect-max-score 1
nodetool game simulate game.json --ticks 3600 --bot 0 --bot-file bot.js --seeds 8 --max-session-ticks 2400
nodetool game simulate game.json --ticks 3600 --bot hold --end-event lose --max-session-ticks 3600
```

`--bot` takes a skill from 0 to 1 or the name of a built-in edge-case bot:

| Bot | Plays |
|---|---|
| `idle` | No input |
| `hold` | Every action pressed on the first tick and never released, like a finger that stays down |
| `mash` | Every action pressed on every other tick |
| `random` | One random action held or tapped for 6 to 30 ticks at a time |

A skill bot runs the game's own policy from `--bot-file`. The file is a function or an object with `decide(view, bot)`, and it runs in the script sandbox with no clock:

```js
({
  decide(view, bot) {
    const gem = view.sprites.find((sprite) => sprite.assetId === "gem");
    const player = view.sprites.find((sprite) => sprite.assetId === "player");
    if (!gem || !player) { return { ticks: 10 }; }
    // One roll per gem, however often the bot decides.
    const skilled = bot.rollFor("gem:" + gem.entityId) < bot.skill;
    return { hold: skilled ? [gem.x > player.x ? "right" : "left"] : [], ticks: 10 };
  }
})
```

- `view` holds what the player sees: `tick`, `sceneId`, `score`, `won`, the frame size and camera, the drawn `sprites` (entity id, asset id, position, size, layer, frame, opacity), the `hud` labels and the `ui` frame. It has no entity props or script state, so a policy that wins shows that the screen gives the player enough information.
- A decision is `{ hold, tap, ticks, state }`. `hold` actions stay pressed for `ticks` ticks. `tap` actions are pressed on the first tick only. `ticks` is required, from 1 to 3600, and the bot is not called again until they pass. `state` comes back as `bot.state` on the next call.
- `bot.skill` is the `--bot` value and `bot.actions` the game's input actions. `bot.roll` is one number per call, and `bot.random()` and `Math.random()` draw more.
- `bot.rollFor(key)` returns the same number for the same key for the whole run. Use it for each game decision, such as one answer or one target. A bot that rolls again at every call gets many tries at the same choice, and a weak bot then wins far more often than its skill.
- Bot numbers come from their own stream. The game's random numbers are the same as in a recorded run with the same seed.
- A `decide` call may take 100 ms. An unknown action, a decision without `ticks`, or an error stops the run and is reported.

`--seeds N` runs seeds `--seed` to `--seed + N - 1`, with fresh saves for each run. Without `--bot` it replays `--inputs` on each seed. A session ends at a win or at a trigger event named with `--end-event`. Each run reports its end tick, score, win, decision count and any script error with its tick. The summary has wins, ended runs, the score range and the session length range in ticks.

Every sweep fails when a run has a script or bot error, including a failed script `assert`. These options add checks over every run, and a failed check lists its seeds:

- `--expect-win` and `--expect-no-win`.
- `--expect-min-score` and `--expect-max-score`. The engine has no star rating, so cap a weak bot's result with a score.
- `--max-session-ticks`: each session must end within this many ticks. A session that never ends fails it. Run it with the weakest bot, which plays longest.

`--assertions`, `--verify-replay` and `--expect-score` check one run and are refused in a sweep.

## Test-mode scripts

`simulate` is a test run, with or without a bot. Scripts read `input.test` as `true`, and two commands help a test read what the game does:

- `{ kind: "assert", ok, message }` fails the run when `ok` is false. The report has `scriptFailure` with the tick and message, and the exit status is 1. Play drops asserts, so write each promise of a level as one assert and keep it in the game.
- `{ kind: "log", message, tag, data }` adds a line to the report's `logs`. Text output prints tagged lines, warnings and errors. Lines logged before a failure stay in the report.

A script failure of any kind, not only an assert, ends the run with `scriptFailure` and the log lines before it. A script that branches on `input.test` behaves differently in play, so replay a test run only as another test run.

```bash
nodetool game simulate game.json --ticks 1200 --json --param spawnRate=0.4 --param boss:health=80
nodetool game simulate game.json --ticks 60 --scene kit --json
nodetool game capture game.json --ticks 1 --scene kit --out kit.png
```

- `--param name=value` sets a declared script parameter for this run. `entity:name=value` sets it on one entity only. The value is JSON when it parses as JSON, otherwise text. The document checks it against the declaration, and a parameter that no script declares is an error. The file is not changed. Sweep a constant this way and write the best value back with the Inspector or the agent.
- `--scene <id>` starts in that scene instead of the entry scene. Keep a debug scene, for example a kit scene that draws every sprite in each animation state at full size, and capture it before you build the game logic.

## Regression fixtures

Keep a fixture for each bug you fix.

- Store the document, the seed, the input recording, and the assertions together, and run them with `simulate`.
- Record routes that include falling, recovery, repeated actions, and scene transitions as well as the winning path. Reaching the objective once does not show that recovery or restoration works.
- Sweep at least 8 seeds with a skill 0, a weak and a full-skill bot, and run the four edge-case bots. Faults in a hint or fail path show up only for the weak bots.
- Add `--verify-replay` to routes that use saves, timers, or spawned entities.
- Capture selected ticks to check what the player sees. Pin pixel comparisons to one renderer, because software and hardware output differ.
- When you measure cost, keep the same document, route, tick count, and renderer between runs so the numbers compare.

The test suites in `packages/game-runtime/tests` and `packages/cli-game/tests` use the same pattern, including recorded routes, snapshot restoration, and golden frames.

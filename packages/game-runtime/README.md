# Native game simulation

The public factories preserve legacy schema versions 1 and 2 with engine `1`.
Schema version 3 uses `dimension: "3d"` and engine `2`. `openGameSession`
validates the version and prepares the selected spatial implementation. Opening
2D does not import Rapier or Three.js.

Both dimensions use the shared [gameplay lifecycle](src/gameplay/lifecycle.ts)
for score, collection, triggers, lifetime, spawning, transitions, HUD, audio,
health state, seeded randomness, event limits and failed-tick handling. The
legacy ordered-event, render-frame and snapshot characterization fixtures were
recorded before extracting those rules.

3D uses pinned Rapier WASM with meters, Y up, normalized quaternions and a fixed
60 Hz tick. Player capsules remain upright. Follow-camera state and controller
state belong to snapshots. Authored follow-camera yaw, pitch and pitch limits
use degrees. Committed camera yaw/pitch and script camera inputs use radians.
Visual model animation is cosmetic and cannot move
physics bodies. Scripts run in the same isolated QuickJS scheduler with explicit
3D commands and JSON state. Query results arrive in the next tick.

Prepared collider bytes must match their binding digest, version, counts and
bounds before creating a physics shape. Triangle meshes require static bodies.
Physics hierarchies reject scale and competing transform owners. Snapshot
restore verifies the engine build and the authored document digest. Every 3D tick
rehydrates the serialized Rapier world before advancing physics, including a
continuous session. Rapier omits transient traversal caches from its snapshots.
Using that same codec boundary on both paths preserves exact world bytes after
resume. This trades serialization work for strict replay in small worlds, and
releases the previous world and its controllers each tick.

The package uses TypeScript's bundler resolution for Rapier's declaration files,
which contain extensionless internal imports. Its compiled output remains ESM
and is exercised through the public factory in Node.

Run `npm run test --workspace=packages/game-runtime` for compatibility, controller,
physics, script isolation, prefab and replay fixtures. See the
[3D design](../../docs/plans/native-game-3d-upgrade.md) for ownership rules and
release scope.

The [Relay Yard example](samples/relay-yard/README.md) provides an asset-free
3D course, a completion recording and CLI assertions for collection, gate
movement and the finish.

## Repository notes

These notes cover code paths the in-product agent cannot reach. The shipped
`native-game` and `native-game-reference` skills hold the document contract.

### Systems and timings

The 3D session runs input, scripts, character movement, physics, contacts,
gameplay rules, animation presentation, and presentation events in that order.
Animation commands take effect during the script phase. The animation phase
updates hierarchy and camera presentation, then finalizes simulation events,
RNG, and tick state. The presentation system only mirrors the committed output.
The 2D session runs input, scripts, physics, contacts, gameplay, and
presentation phases. Feature systems live in [src/systems/](src/systems/).

Each `GameSystem` exposes `init`, `step`, `snapshot`, and `restore`.
`GameSystemPipeline` initializes and steps systems in registration order and
restores them in reverse, so gameplay restores entities before spatial adapters
restore their state. Stateless systems snapshot to `null`. The public session
snapshot format does not change.

Open a session with `recordTimings: true` and read `step(input).timings`, a
`GameStepTimings` value with per-system `durationMs` and `totalMs`. Timings are
off by default and never saved. Call `session.takePresentationEvents()` after
each tick to consume that tick's presentation events, such as `emitParticles`.
Consuming them does not change gameplay events or snapshots, and the channel is
empty after a restore.

Hosts draw 2D particles with `GameParticles2D` from `@nodetool-ai/game-renderer`.
After every step, call `particles.tick(step.frame,
session.takePresentationEvents())` and pass `particles` as the third argument
of `renderer.render`. Its `ParticleSimulator` simulates at most 0.25 s per step,
so a resumed tab does not replay a long pause. `GameAudioPlayer` exposes
`setBusVolume`, `setBusMuted` and `spatialQuality: "low"` (equal-power panning
instead of HRTF).

### Editor internals

Both editor controllers render through `GameEditorShell` in
`web/src/components/game/shell/`. Register panels with
`createGamePanelRegistry().register()` or `gamePanelRegistry.register()`. Each
registration returns an idempotent disposer. Controllers keep document, save,
publish, restore and session ownership. Draft history exposes labelled commands
through `commandHistory.past` and `commandHistory.future`. A viewport drag is
one command. Undo and redo rebuild only the unsent save suffix from the
confirmed draft plus any protected submitted prefix. The editor saves at most
1,024 operations per request, and the changes panel receives at most 1 MiB of
recent history.

### CLI checks and benchmarks

- `nodetool game simulate --assertions <file>` checks selected ticks for scene,
  entity position, active state, and ordered events. `--verify-replay` restores
  a midpoint snapshot and reports the first differing tick and field.
- `nodetool game bench <file> --json` reports simulation tick, script and
  per-system latency percentiles, heap delta and sampled allocation bytes. Use
  `--ticks` and `--warmup` for measured and warmup tick counts.
- `nodetool game capture` reports `budget.overruns` for a 3D frame.
- `nodetool game smoke <directory>` loads an exported player in Chromium,
  renders 300 frames with scripted input, and exits nonzero on browser errors,
  missing assets or stalled ticks. Add `--json` for the report.
- The game-renderer `benchmark:effects` script with `--game <3d-file>
  --assets-dir <directory>` renders 600 frames and reports GPU frame latency,
  draw calls and triangles. See [the effect benchmark](../../docs/native-game-effect-benchmark.md).

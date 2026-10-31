# Kindle native 2D port

This fixture adapts `packages/game-runtime/samples/kindle` to schema 5,
`native-cpp-1`, native swept-AABB 2D physics and shared QuickJS. It leaves the
original document, scripts, completion inputs and media unchanged. It uses no
legacy TypeScript session or renderer.

Both scenes and all 157 source entity IDs are retained. There are 153 initial
entities and four spawn templates. Sprites, atlas frames, animators, tilemaps,
colliders, bodies, point lighting, camera projection and parallax backgrounds
use their admitted native 2D components. Source IDs require no renaming.
The title, camera and hero function bodies remain verbatim inside generated
native wrappers. Their byte lengths and SHA256 hashes are recorded in
`provenance.json`. Each scene has one controller with separate original role
states. The temple controller also implements the 13 patrol roles using native
per-entity movement intents, authored bounds, wall contacts and compact tile-solid ledge
probes. The source scene order is retained inside the controller.
Qt supplies a default movement intent for every kinematic 2D body, including
zero movement. Hero and crawler velocities therefore become explicit native
`move` intents that override that default. Static lifts retain `setVelocity`.
Spawned kinematic dust/splash entities receive zero intents until their actual
lifetime despawn, so keyboard movement cannot drag them. Both the route and
probes include Qt-shaped `move`, `actions` and `jump` inputs.

Collection requires actual entering/staying hero/cell contacts. Only those
contacts produce native score and despawn commands, and each cell is deduplicated.
The original hero receives corresponding collected events. Automatic native
collectibles are deliberately unused because their any-actor collection rule
would differ from Kindle. Checkpoints, death waits, respawn, variable-height
jumps, wall jumps, mushroom bounces, enemy stomps and beacon victory remain in
the unchanged hero function. Emitted events reach other roles on the following
native tick. The controller does not teleport the completion route or synthesize
victory.

All 39 original media bindings are verified against their authored hashes before
staging. The MP3 music receives a separate IEEE float32 WAV copy decoded by
ffmpeg, without additional PCM16 quantization. Both source and prepared hashes
are recorded. The resulting music file is approximately 32 MiB and is within the
installed native 64 MiB file/audio admission bound. This fixture does not claim
browser 8 MiB asset portability.

## Presentation limits

Native2D has no source UI/widget tree, custom HUD fonts, particle components,
visualAnimation or postprocessing contract. The port explicitly inventories
those omissions in provenance. It uses supported static title/help text and
the native score placeholder instead of recreating the original animated title,
ember/checkpoint/death/time widgets or victory panel. The actual original
victory event and state remain testable independently of the HUD. Particle
emission commands are omitted. Spawned dust/splash entities retain their sprite,
animation and lifetime, but unsupported lifetime fading/scaling is omitted.

Audio bindings become native scene-music and event-playback commands. A stable
music voice ID replaces the title loop on temple entry. Source bus gains,
reverb, ducking, snapshots, lowpass, fades and spatial attenuation are not
reproduced. Source visualAnimation water/rays remain static admitted sprites.
This is a playable native port with documented presentation differences, not
a claim of screenshot or audio identity.

## Reproduce

Use the repository Node version, built workspace packages and ffmpeg. Set a
writable `TMPDIR` and installed runtime paths:

```bash
export KINDLE_OUT="$TMPDIR/kindle-native-qa"
export NODETOOL_NATIVE_GAME_WORKER=/path/to/install/bin/game-worker
node --test native/game/tests/fixtures/kindle/adapt.test.mjs
node native/game/tests/fixtures/kindle/adapt.mjs packages/game-runtime/samples/kindle "$KINDLE_OUT"
node native/game/tests/fixtures/kindle/run.mjs "$KINDLE_OUT" "$NODETOOL_NATIVE_GAME_WORKER"
node native/game/tests/fixtures/kindle/verify.mjs "$KINDLE_OUT"
node native/game/tests/fixtures/kindle/probes.mjs "$KINDLE_OUT" "$NODETOOL_NATIVE_GAME_WORKER"
ctest --test-dir "$NATIVE_GAME_BUILD_DIR" -R '^native-game-kindle-fixtures$' --output-on-failure
```

The runner translates the 3535 original recorded action frames into native
actions, validates and opens the actual installed worker, and replays 1768
continuation frames after restoring a midpoint snapshot in the same live
session. Frame digests must match. Its recorded native observations are then
checked for 46 physical collections, four checkpoints, one victory and no hurt
events. These are route outcomes, not imported legacy positions or a requirement
that every ember be collected. `probes.mjs` separately exercises Up jump,
rightward movement, the original following camera, a real non-player/cell
contact with explicitly broadened test masks, and water death/respawn.

The output includes the closed native document, prepared assets, provenance,
recorded native route, representative raw frames, observations and JSON reports.
Partial CPU diagnostics can set `KINDLE_TICKS`, but they cannot pass the full
route verifier. Installed Qt captures and live keyboard QA are separate checks.
Benchmark the installed worker only when other measured work is idle:

```bash
/path/to/install/bin/game-bench "$KINDLE_OUT/game.json" --ticks 240 --warmup 60 --max-p95-ms 4
```

That benchmark is idle simulation,
not completion-route performance or hardware frame rate. Software-rendered
captures do not establish hardware FPS. No quality or engine limits are raised.

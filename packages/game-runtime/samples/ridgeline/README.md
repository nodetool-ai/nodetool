# RIDGELINE

A flight simulator demo built on NodeTool's native 3D runtime. Take off from
the island airfield in the RJ-7 Kestrel, fly 13 gates through a river canyon
and over the northern ridges, and finish with a low pass over the runway. The
course is 17.5 km long. The recorded route finishes in 2:11.77.

The demo shows what the engine's physics and renderer can do with a large
open scene. It uses:

- A 10 km island: four terrain tiles meshed adaptively from a 4.9 m height
  grid, with 2048 px albedo and normal maps per tile, about 22,000 conifers,
  a canyon river, a sea plane with a ripple normal map, and cloud banks.
- A golden-hour look: a low sun with four shadow cascades out to 4.5 km, a
  procedural sky, height fog, ACES tone mapping, bloom, vignette, and SMAA.
- A rigid-body jet driven by forces the script computes each tick: lift with
  a stall break, induced and gear drag, air density falling with altitude,
  afterburner thrust, and fly-by-wire rate commands limited by speed and load
  factor. The landing gear is three ray-cast spring and damper legs with tyre
  friction, nose wheel steering and wheel brakes.
- A jet model with control surfaces and landing gear on their hinge lines. An
  animation graph blends the surfaces from stick input and plays the gear
  retraction.
- Particles for afterburner flame and shock diamonds, heat haze, wing
  condensation and wingtip trails under load, gate bursts, and the crash
  explosion. The bursts are prefabs, so they cost no script calls.
- A UI widget tree for the HUD: airspeed, altitude, heading, load factor,
  throttle, gear, the next gate and its distance, elapsed time, a stall
  warning and a finish panel, in Bebas Neue and Inter.
- Spatial engine and wind grains that the jet script picks by throttle and
  airspeed, spatial gear and touchdown sounds, a streamed score, and a mixer
  with an engine bus, reverb, music ducking and a finish snapshot.

Install RIDGELINE from NodeTool's Examples page to copy the game, models, and
audio into your project.

| Control | Keyboard | Gamepad |
|---|---|---|
| Pitch | W/S or Up/Down | Left stick |
| Roll | A/D or Left/Right | Left stick |
| Rudder | Q/E | Shoulder buttons |
| Throttle | Shift or Z up, Ctrl or X down | Triggers |
| Gear | G | Y |
| Brake and air brake | B | B |
| Camera | C | X |
| Respawn at the last gate | R | Back |

Throttle above 90 % lights the afterburner. The jet holds its parking brake
until the throttle first comes up. Touching the terrain or the sea respawns
the jet at the last gate it passed.

## Regenerating the media

The `tools/` scripts regenerate every asset from fixed seeds. Each one
documents its usage. Run them from the repository root in this order, with
`OUT` as a scratch directory:

```bash
python3 packages/game-runtime/samples/ridgeline/tools/build_terrain.py OUT
python3 packages/game-runtime/samples/ridgeline/tools/plan_course.py OUT
python3 packages/game-runtime/samples/ridgeline/tools/build_collider.py OUT
python3 packages/game-runtime/samples/ridgeline/tools/build_props.py OUT
python3 packages/game-runtime/samples/ridgeline/tools/build_jet.py OUT/jet.glb
python3 packages/game-runtime/samples/ridgeline/tools/synthesize_audio.py OUT/audio
ffmpeg -i OUT/audio/score.wav -c:a libvorbis -q:a 4 OUT/audio/score.ogg
node packages/game-runtime/samples/ridgeline/tools/build_game.mjs OUT
node packages/game-runtime/samples/ridgeline/tools/record_route.mjs OUT
```

`build_game.mjs` needs `npm run build:packages` first. It prepares each model
with the engine's own preparation code and writes `game.json` and `assets/`.
`record_route.mjs` flies an autopilot along the racing line, one leg at a time,
and writes the recording only after a full replay passes every gate in order.
Re-record whenever the course, the collider or the jet script changes.

The terrain collider is a separate, coarser mesh than the rendered terrain:
about 40 m cells near the racing line and the airfield, and about 310 m
elsewhere. The physics world is serialized every tick, so its cost grows with
the triangle count.

## Checks

After `npm run build:packages`, run from the repository root:

```bash
npm run nodetool -- game validate packages/game-runtime/samples/ridgeline/game.json
npm run nodetool -- game simulate packages/game-runtime/samples/ridgeline/game.json --ticks 7942 --seed 1 --inputs packages/game-runtime/samples/ridgeline/completion.inputs.json --assertions packages/game-runtime/samples/ridgeline/completion.assertions.json --verify-replay
npm run test --workspace=packages/game-runtime -- ridgeline
```

Rebuild the shipped example bundle from this source with:

```bash
node scripts/example-games/build.mjs --slug=ridgeline
```

Add `--posters` to capture the catalog image again.

Bebas Neue and Inter are under the SIL Open Font License, copied in
[licenses](licenses/).

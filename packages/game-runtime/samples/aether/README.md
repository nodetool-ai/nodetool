# AETHER // Skybound

A third-person platformer through a floating celestial observatory. Recover
five prisms across 22 platforms and reach the crown. Four checkpoints preserve
collected prisms when you fall or touch a laser. The recorded route wins at
tick 2368 with no returns.

The course progresses from narrow offset jumps to pulsing laser barriers,
three collapsing steps, a ferry that drifts sideways, and a final precision
ascent. Amber steps collapse 42 ticks after landing and rebuild after 240 ticks.
Lasers are active for 75 ticks of each 180-tick cycle. The amber floor line
marks the beam's path even while it is off. Wait for a clear landing or jump
over the beam. Both ferries carry a standing player.

Install from **Examples → Start from a game → AETHER // Skybound → Play and edit**.
WASD moves, Space jumps, and R returns to the checkpoint. Hold the right mouse
button to turn the camera in the editor, or drag in the standalone player.

The course uses ivory stone with mineral veins, brass inlays, turquoise energy,
and a rose-violet sky. Original geometry, procedural textures, and synthesized
chimes are authored in [aether.mjs](../../../../scripts/example-games/aether.mjs).
Movement runs at 7 meters per second, with 46 meters per second squared
acceleration, an 8.8 meters per second jump, gravity of 17 meters per second
squared, and eight ticks each of coyote time and jump buffering.

From the repository root after `npm run build:packages`:

```bash
node scripts/example-games/aether.mjs
node scripts/example-games/build.mjs --slug=aether --posters
npm run nodetool -- game simulate packages/game-runtime/samples/aether/game.json --ticks 2434 --seed 1 --inputs packages/game-runtime/samples/aether/completion.inputs.json --expect-score 5 --expect-win --verify-replay
npm run nodetool -- game build packages/game-runtime/samples/aether/game.json --assets-dir packages/game-runtime/samples/aether/assets --out .cache/aether-web
```

Serve the exported directory over HTTP. The game runs on the built-in 3D engine
and includes its assets locally. Tests cover the winning route, a save restored
while riding the ferry, fall and laser recovery, collapsing-platform rebuilds,
and manual checkpoint return.

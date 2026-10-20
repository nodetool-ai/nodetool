# BLACKSITE

A first-person shooter mission built on NodeTool's native 3D runtime. Destroy
five security drones, then reach the cyan extraction gate behind the reactors.
Cover stops rifle shots and enemy fire. The rifle holds 18 rounds and reloads
in 72 ticks. Each drone charges for 39 ticks, glowing red, before it fires.

The mission is the engine's flagship 3D demo. It uses:

- A night look: a moonlit key light with three shadow cascades, a procedural
  sky, height fog, AgX tone mapping, bloom, vignette, and SMAA.
- Particles for muzzle flash, tracers, sparks, rain, splashes, steam, embers,
  and drone explosions. Rifle impacts, explosions, and drone shots are prefabs
  that the player script spawns, so they cost no script calls.
- Decals for floor stencils, hazard stripes, oil, grime, and scorch marks.
- A hover clip in the drone model, played by an animator without a script.
- A UI widget tree for the HUD, with Bebas Neue and Inter fonts.
- Spatial sound for drone charges, shots, and explosions, a streamed music
  loop, and a mixer with buses, reverb, ducking, and an extraction snapshot.

The `tools/` scripts regenerate the media: `synthesize_audio.py` (effects and
score), `paint_decals.py` (decal images), `build_rifle.py` (rifle model), and
`prepare_drone.py` (drone hover clip and sensor). Each one documents its usage.
[Texture prompts](textures/PROMPTS.md) record the facility imagegen inputs.
Bebas Neue and Inter are under the SIL Open Font License, copied in
[licenses](licenses/).

Install BLACKSITE from NodeTool's Examples page to copy the game, models, and
audio into your project. In the editor player, hold the right mouse button to
aim and press F to fire. The standalone player also supports mouse capture.

Rebuild the shipped example bundle from this source with:

```bash
node scripts/example-games/build.mjs --slug=blacksite
```

Add `--posters` to capture the catalog image again.

After `npm run build:packages`, run from the repository root:

```bash
npm run nodetool -- game validate packages/game-runtime/samples/blacksite/game.json
npm run nodetool -- game simulate packages/game-runtime/samples/blacksite/game.json --ticks 583 --seed 1 --inputs packages/game-runtime/samples/blacksite/completion.inputs.json --assertions packages/game-runtime/samples/blacksite/completion.assertions.json --verify-replay
npm run nodetool -- game build packages/game-runtime/samples/blacksite/game.json --assets-dir packages/game-runtime/samples/blacksite/assets --out .cache/blacksite-web
python3 -m http.server 8894 --bind 127.0.0.1 --directory .cache/blacksite-web
```

Open <http://localhost:8894/>. The export directory must be empty before building.
Use localhost or HTTPS because the player verifies assets with Web Crypto.
Click the viewport to capture the mouse. If capture is unavailable, hold and
drag to aim and press F to fire. WASD moves, Space jumps, R reloads, and Escape
releases the mouse. Pause and Reset are below the viewport.

The recorded route reloads, destroys every drone, and emits `victory` at tick
560. Completion is a scripted event, asserted by the recording. It does not use
the collection system's `snapshot.won` flag. Replay verifies restoration from
the midpoint. Combat and cover checks run with:

```bash
npm run test --workspace=packages/game-runtime -- blacksite
```

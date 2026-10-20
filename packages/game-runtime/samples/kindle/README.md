# Kindle

A jump-and-run through a drowned temple, built on NodeTool's native 2D runtime.
The hero is a small flame. Run, wall-jump, bounce on mushrooms, and ride lifts
to relight four braziers, gather embers, and reach the beacon. Thorns and
flooded pits put the flame out, and it returns at the last lit brazier.

The game is the engine's flagship 2D demo. It uses:

- Flooded pits: animated water sprites over the thorns, with mist, glints,
  bubbles, a cyan glow, and a splash when the hero falls in.
- Additive light shafts that pulse, a canopy vignette, drifting motes and
  spores, bloom, and a color grade.
- Particles for the hero's trail, sparks, wisps, landing dust, brazier and
  beacon fire, smoke, and mushroom spores. Effects are particle emitters on the
  hero and on spawned prefabs, so they cost no extra script calls.
- A UI widget tree for the HUD: ember count, brazier pips, clock, falls, notes,
  and the win panel. The title screen uses the same tree.
- Spatial ember chimes and a mixer with buses, a cavern reverb, ducking under
  cues, and title and finale snapshots.

The `tools/` scripts regenerate the media this pass added:
`paint_textures.py` (water, light shafts, vignette, title glow, HUD icons) and
`synthesize_audio.py` (splash, brazier ignition, ember chime, title cue). Each
one documents its usage. Bebas Neue and Playfair Display are under the SIL Open
Font License, copied in [licenses](licenses/).

Install Kindle from NodeTool's Examples page to copy the game, art, and audio
into your project. Arrows run, Space jumps, and jumping against a wall kicks off
it.

Rebuild the shipped example bundle from this source with:

```bash
node scripts/example-games/build.mjs --slug=kindle
```

Add `--posters` to capture the catalog image again.

After `npm run build:packages`, run from the repository root:

```bash
npm run nodetool -- game validate packages/game-runtime/samples/kindle/game.json
npm run nodetool -- game simulate packages/game-runtime/samples/kindle/game.json --ticks 3535 --seed 1 --inputs packages/game-runtime/samples/kindle/completion.inputs.json --verify-replay
npm run nodetool -- game build packages/game-runtime/samples/kindle/game.json --assets-dir packages/game-runtime/samples/kindle/assets --out .cache/kindle-web
python3 -m http.server 8895 --bind 127.0.0.1 --directory .cache/kindle-web
```

Open <http://localhost:8895/>. The export directory must be empty before
building. Use localhost or HTTPS because the player verifies assets with Web
Crypto.

The recorded route lights all four braziers, collects 46 of 73 embers without a
fall, and emits `victory` at tick 3334. Completion is a scripted event. It does
not use the collection system's `snapshot.won` flag. The route and the splash
check run with:

```bash
npm run test --workspace=packages/game-runtime -- kindle
```

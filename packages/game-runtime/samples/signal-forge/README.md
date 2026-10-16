# Signal Forge

A third-person relay puzzle through an industrial facility. Push the amber core
into its receiver, ride the moving shuttle, then use the coolant and reactor
terminals to reach the final beacon. The 70-metre route includes checkpoints,
a furnace crossing, a rising bridge and a final bulkhead.

The example includes original bevelled machinery, procedural surface textures,
a courier model, a 48-second stereo score and seven synthesized effects. Models
and audio are checked in with their recorded SHA-256 digests. The shipped bundle
uses package asset URIs and installs the media into the player's own project.

Install **Signal Forge** from NodeTool's game examples. WASD or arrows move,
Space jumps, E repulses the core and activates nearby terminals, and R returns
to the current checkpoint. Hold the right mouse button to turn the camera.
Audio begins after a player gesture.

The authored static machinery includes a prepared triangle-mesh collider for
turbine housings, induction tanks, reactor pillars and gate posts. Column
colliders match the visible structures. Small decorative details do not each
have a separate collider. Moving gates, the shuttle and the core retain their
own colliders.

From the repository root after `npm run build:packages`:

```bash
node scripts/example-games/build.mjs --slug=signal-forge
npm run nodetool -- game validate packages/game-runtime/samples/signal-forge/game.json
npm run nodetool -- game simulate packages/game-runtime/samples/signal-forge/game.json --ticks 1219 --seed 1 --inputs packages/game-runtime/samples/signal-forge/completion.inputs.json --assets-dir packages/game-runtime/samples/signal-forge/assets --expect-win --verify-replay
npm run nodetool -- game build packages/game-runtime/samples/signal-forge/game.json --assets-dir packages/game-runtime/samples/signal-forge/assets --out .cache/signal-forge-web
```

Add `--posters` to the bundle command to capture the catalog image again. Serve
the exported directory over localhost or HTTPS so asset verification can use
Web Crypto. The recorded route completes the objectives with these colliders.
The runtime regression checks four visible obstacle surfaces, objective order,
snapshot restoration, and manual and fall recovery.

# Sunrush Kart

A single-player, three-lap coastal kart race built with the native NodeTool
3D engine. Five rivals compete with the player on an elevated harbor circuit.
The source game, models, music, and sound effects can be rebuilt locally.

## Play

From the repository root, after `npm run build:packages`:

```bash
node packages/game-runtime/samples/sunrush-kart/tools/build.mjs
npm run dev:nodetool -- game build packages/game-runtime/samples/sunrush-kart/game.json --assets-dir packages/game-runtime/samples/sunrush-kart/assets --out dist/sunrush-kart
cp -R packages/game-runtime/samples/sunrush-kart/licenses dist/sunrush-kart/licenses
python -m http.server 8090 --directory dist/sunrush-kart --bind 127.0.0.1
```

Open <http://localhost:8090>. The export uses the NodeTool runtime and needs
no server API or external network resources. Export into an empty directory.
Keep an earlier build by renaming its directory before exporting again.

| Control | Keyboard | Gamepad |
| --- | --- | --- |
| Accelerate / brake / reverse | W / S or up / down | RT / LT |
| Steer | A / D or left / right | Left stick |
| Drift and charge a boost | Hold Shift while steering, then release | Hold A, then release |
| Use held item | Space or E | X |
| Look behind | Q | B |
| Recover on the road | R | Y |
| Start / retry | Enter or the menu button | Menu or A on the menu |
| Pause | P or Escape | View |

## Direction

| Decision | Implementation target |
| --- | --- |
| Player promise | Steer through coastal bends, charge a drift boost, use items, and finish three ordered laps against five rivals. |
| Style | Stylized sculpted 3D, turquoise sea and coral-orange racing colors, rounded silhouettes, warm afternoon light, clean painted surfaces. |
| Depth | Open sky and islands behind a seaside village, with palms and a lighthouse framing the road and distinct kart silhouettes in front. |
| Handling | 37 m/s top speed, 15 m/s² acceleration, 34 m/s² braking, 49 m/s boost, free steering and lateral drift on a 14-meter road. |
| Pacing | Wide start straight, harbor bends, elevated bridge, tight return bends, and finish straight. |
| Assets | Original merged track and scenery meshes, detailed karts and drivers, textured coastal water, synthesized music and event cues, and OFL display/UI fonts. |
| Proof | A recorded input route starts the race, drives three laps, and emits a finish event. The same route feeds capture and performance checks. |
| Performance | 60 Hz simulation, 4 ms tick p95 and 16.6 ms frame p95 targets, 500 draws and 3 million triangles per frame. Base M1-class hardware is the intended minimum, not a certified target. |

The engine exposes pose commands only for the issuing entity, so each racer
has its own script. A separate camera script and HUD script read compact
runtime properties. Lap progress follows ordered course segments, not elapsed
time. The geometry builder and controller use the same sampled course.

The world and HUD render at 1024 × 576. `GAME_VIEWPORT` in
`tools/presentation.mjs` controls that resolution and scales the UI from its
1280 × 720 design coordinates. Race readouts update four times per second to
limit canvas texture uploads. Menu and countdown changes update immediately.

`tools/art.mjs` builds the kart markings, mechanical details, textured asphalt,
village architecture, and vegetation. `tools/ocean.mjs` builds the sea with
depth-dependent colors, tiled ripple normals, and soft shoreline foam.
The water surface is static. Warm sunlight, cascaded shadows, and neutral
tone mapping preserve the coastal palette. Drift sparks and boost particles
use separate color and fade curves for clear racing feedback.

## Verification

```bash
npm run dev:nodetool -- game validate packages/game-runtime/samples/sunrush-kart/game.json
node packages/game-runtime/samples/sunrush-kart/tools/record_route.mjs
npm run dev:nodetool -- game simulate packages/game-runtime/samples/sunrush-kart/game.json --ticks 4120 --inputs packages/game-runtime/samples/sunrush-kart/completion.inputs.json --assertions packages/game-runtime/samples/sunrush-kart/completion.assertions.json --verify-replay
npm run dev:nodetool -- game bench packages/game-runtime/samples/sunrush-kart/game.json --inputs packages/game-runtime/samples/sunrush-kart/completion.inputs.json --warmup 600 --ticks 600 --fail-on-budget
npm run dev:nodetool -- game capture packages/game-runtime/samples/sunrush-kart/game.json --inputs packages/game-runtime/samples/sunrush-kart/completion.inputs.json --assets-dir packages/game-runtime/samples/sunrush-kart/assets --ticks 1200 --out dist/sunrush-race.png --fail-on-budget
npm run dev:nodetool -- game perf packages/game-runtime/samples/sunrush-kart/game.json --inputs packages/game-runtime/samples/sunrush-kart/performance.inputs.json --assets-dir packages/game-runtime/samples/sunrush-kart/assets --seconds 10 --fail-on-budget
```

The assertions verify the scripted finish and victory events. The CLI's
`--expect-win` flag checks the engine's collectible win state, which this race
does not use. The full completion recording ends at the results screen. The performance
recording stops during racing so measurement includes moving vehicles.
If handling changes, regenerate the route and use the tick count it reports.
Hardware performance must be measured on the target machine. Software
rendering timings do not certify a GPU frame target.

## Licenses

Track, kart, and audio assets are original procedural work. Bebas Neue and
Inter are redistributed under the SIL Open Font License. Their license files
are in [licenses](licenses/).

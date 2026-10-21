---
name: game-direction
description: "Set the feel, level pacing, and art direction before building or revising a native game. Use for a new game, a showcase, a visual overhaul, or a game that plays correctly but feels flat. Pairs with native-game, which owns every tool and schema contract."
---

# Direct a native game

Lock a short direction spec before the first game edit or asset generation.
State the spec in the conversation, then build within the requested scope.
For an existing game, read it and preserve its established direction unless
the brief asks for a change. `native-game` owns the tool and schema contracts.

## Direction spec

| Decision | Record before building |
|---|---|
| Player promise | The action that should feel satisfying, the challenge, and the observable win condition |
| Style string | One exact reusable string naming medium, palette, edge treatment, lighting, and texture |
| Layer plan | Sky, far background, midground, play layer, and foreground, with their depth, contrast, and parallax |
| Feel parameters | Movement speed, acceleration and braking, jump height and duration, coyote ticks, buffer ticks, and feedback timing |
| Pacing sheet | Ordered teaching beats, their safe practice area, challenge, recovery, and finish |
| Asset plan | Hero poses, aligned frames, terrain edge variants, effects, sound cues, music, and fonts |
| Proof route | Start scene, required targets, win signal, expected duration, and captures at the teaching beat and hardest section |
| Performance budget | Game type, slowest target machine and display rate (60 or 120 Hz), then the draw call, triangle, cascade, particle and script budgets that follow from them |

For a small prototype, keep each row to one sentence and use only the layers
and assets the brief needs. The jump, coyote and layer rows assume a side-view
platformer. For a top-down game (the 2D default), record movement speed,
acceleration, braking and facing instead of jump rows, and replace the depth
layers with ground, props, overhead decoration and lighting. For a 3D
exploration game, record the controller speed, jump, follow-camera offset
and pitch limits, and plan sky, lighting and landmarks instead of parallax layers.
A showcase needs a visible depth plan and a finished art pass. Load
`native-game` for the build loop, `native-game-reference` for the document
fields, and `list_example_games` and `get_example_game` for shipped references. Study Kindle for a platformer
with animated poses, terrain edges, parallax, lights, sound cues, and a grade.
Use its decisions as a benchmark for the brief, without copying its theme.

## Performance budget

Decide the budget with the look, because the look spends it. Pick the game type
row in `native-game-performance`, name the slowest Mac the game must run on,
and choose 60 Hz (`frameMs` 16.6) or 120 Hz (`frameMs` 8.3). Then plan the
scene inside that row: how many shadow cascades and how far they reach, which
meshes cast, which props merge into one model, how many particles and soft
emitters the busiest moment shows, and how many scripts drive it. A sweeping
vista, dense forest or particle storm is a budget decision, not only an art one.
Record the budget with `set_performance` before the art pass.

## One style string

Repeat the locked style string verbatim in every visual prompt. Add the asset's
role, dimensions, framing, and transparency requirements after that string.
Pass one installed style reference as `reference_slot` on `generate_game_asset`
when the selected model accepts an input image.
Changing the palette or edge treatment for one asset requires updating the
spec and the related assets.

Keep the player's silhouette readable against the play layer. Background
contrast and detail should fall with distance. Foreground decoration must leave
hazards and landing surfaces visible. Check the composition at the target
screen size, including touch controls and HUD.

## Game feel

Measure timings in ticks at the engine's 60 Hz rate. For a side-view prototype,
start with 6–8 coyote ticks and 6–8 buffer ticks, then tune them against the
actual level. Coyote time permits a jump shortly after leaving support. A jump
buffer remembers a press shortly before landing. Implement these in persistent
script state using `entity.touching.down` and `justPressed`.

Set jump velocity and gravity from the intended height and airtime. Holding
jump may preserve ascent while release cuts it. Make braking fast enough to
land on the narrowest required platform. Decide whether air steering and wall
jumps are part of the game before laying out challenges that need them.

Give an action a clear response. A jump can use a pose change, a sound cue, and
a brief dust puff. A landing can compress the sprite, then restore it. A hit
needs an immediate flash or recoil and a clear recovery window. Keep squash,
stretch, and screen effects visual so the collider remains predictable. Use
`setVisual`, animation clips, particles, and event-driven audio through the
contracts in `native-game`. Avoid repeated camera motion that obscures a jump.

## Level pacing

Write the pacing sheet before placing the level. Each row identifies the
mechanic, what the player sees before committing, and where a failed attempt
returns them. Introduce a mechanic in safety, ask for one clear use, then
combine it with an earlier mechanic. Put recovery after a demanding section.
Keep checkpoints near the section they protect and make their activation
visible and audible.

Place the first required target where normal play teaches movement. Show the
next landing or objective before asking for a blind commitment. Optional
collectibles can reward risk, but the win route must remain readable without
them unless collection is the stated objective. Test the narrowest clearance,
longest jump, moving platform timing, and respawn state individually.

## Finish and proof

Obtain the proof route with autoplay or a written route, replay it, and
assert the win as `native-game` § Build and revise describes. For a custom
scripted goal, assert the game's own victory signal, not only a target contact.

Capture the start, a representative play section, the busiest frame, and the
finish using the proof route. Run the performance gate in `native-game` on the
same route, and report the measured frame and tick p95 beside the visual checks. Captures return image refs, so call
`view_image` on each frame before judging it. Inspect the images against the
locked layer plan, silhouette contrast, terrain joins, foot alignment, HUD, lighting, and grade.
Schema validation proves structure. An executed route proves that route can
reach its observed target. Visual quality requires inspecting the rendered
frames. Report which of these checks passed and what remains unverified.

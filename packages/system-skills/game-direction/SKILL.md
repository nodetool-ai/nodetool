---
name: game-direction
description: "Set the feel, level pacing, and art direction before building or revising a native game. Use for a new game, a showcase, a visual overhaul, or a game that plays correctly but feels flat."
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

For a small prototype, keep each row to one sentence and use only the layers
and assets the brief needs. A showcase needs a visible depth plan and a finished
art pass. Load `native-game` for the document fields and `list_example_games`
and `get_example_game` for shipped references. Study Kindle for a platformer
with animated poses, terrain edges, parallax, lights, sound cues, and a grade.
Use its decisions as a benchmark for the brief, without copying its theme.

## One style string

Repeat the locked style string verbatim in every visual prompt. Add the asset's
role, dimensions, framing, and transparency requirements after that string.
Use one installed style reference when the selected model accepts references.
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

Use `autoplay_native_game` to obtain an executed input route and its observed
win tick or target contacts. Replay its returned `route` with
`playtest_native_game`, using the same seed. Autoplay supports standard
direction actions and a jump action, and uses bounded steering. A stalled or
budget-limited result does not prove a level impossible. For a custom scripted
goal, supply `target_prefix` and separately assert the game's victory signal.

Capture the start, a representative play section, the busiest frame, and the
finish using the proof route. Inspect the images against the locked layer plan,
silhouette contrast, terrain joins, foot alignment, HUD, lighting, and grade.
Schema validation proves structure. An executed route proves that route can
reach its observed target. Visual quality requires inspecting the rendered
frames. Report which of these checks passed and what remains unverified.

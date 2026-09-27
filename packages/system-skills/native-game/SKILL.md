---
name: native-game
description: "Build or revise a playable 2D game in NodeTool's built-in engine, install generated assets, playtest it, and prepare a standalone web build."
---

# Build a native game

Create and edit a versioned built-in game document. The engine owns simulation,
rendering, and web export. A new game starts as a playable top-down room.

## Build and revise

1. `create_native_game {project_id, name}` creates a game and returns its full id
   and current immutable revision. `get_native_game {game_id, revision?}` reads
   that source. Resource ids may be full ids or exact 12-character prefixes.
2. Edit the returned document's scenes, entities, components, and asset bindings.
   Keep the engine schema valid. `publish_native_game
   {game_id, base_revision, document}` validates and publishes only when the
   revision is still current. On a conflict, read the current revision and
   reconcile the edits before publishing again.
3. Use `install_native_game_asset
   {game_id, base_revision, slot, binding, candidate_workspace_id?}` to install
   a staged, content-addressed image or audio asset. The staged bytes must match
   `binding.digest`. Installation keeps scene and behavior edits.
4. `playtest_native_game {game_id, revision?, seed?, inputs}` runs a fixed-tick
   replay. Each input has `pressed` actions and optional `justPressed` actions.
   Inspect the returned state and events, then revise and replay as needed.
5. `build_native_game {game_id, revision?}` writes a standalone web player for
   an owned revision under the project workspace and returns its path. On a touch
   screen the player adds a floating stick for `left`/`right`/`up`/`down` and one
   button per other input action, labeled with the action name. Installed
   media must still exist, match its recorded digest, and use a supported format.

For a workflow-based brief, `design_game` writes its design and `build_game
{workflow_id, save?}` creates or selects the native game and stages its asset
graph. The graph's generated media are candidates until installed. A game
revision can be played in the workspace. The `nodetool game` CLI validates,
simulates, captures, and builds a standalone web player from a game document.
`simulate --assertions <file>` checks selected ticks for scene, entity position,
active state, and ordered events. `simulate --verify-replay` restores a midpoint
snapshot and reports the first tick and field that differ from continuous play.

## Scripts and visuals

A `script` behavior is a function expression. It receives `{tick, pressed,
justPressed, events, entity, world, state, random}` and returns `{state,
commands}`. `events` are the previous tick's events. `world` lists every active
entity with a collider or camera as `{id, source, x, y}`. A spawned instance has
the id `<prefab>#<n>`, its `source` is the prefab id, and it runs the prefab's
script with its own state.

Each call evaluates its source in a fresh sandbox context. Store persistent
values in returned `state`. Closure variables, globals, and mutations of input
objects do not survive or reach another script. Source initialization also uses
the seeded random generator. `maxTickMs` limits each call, subject to the total
script budget for the tick. Source and input/output limits count UTF-8 bytes.

The commands are `setVelocity`, `setPosition`, `setVisual {tint?, opacity?,
rotation?, scaleX?, scaleY?}`, `spawn {prefabId, x?, y?, velocityX?,
velocityY?}`, `despawn`, `emit`, `sceneTransition`, and `hud {id, text, x, y,
size?, color?, align?}`. HUD coordinates are canvas pixels. Empty text removes a
label. A label with the id `score` or `win` replaces the built-in label.

1. Use `sprite.blend: "additive"` for light drawn on black, such as glows and
   sparks. Set `sampling: "linear"` on painted or soft assets.
2. Use `lifetime {ticks, fade, endScale}` for particles. A kinematic body without
   a collider moves but never collides, which keeps particles cheap.
3. Use `animator` frames on a sprite sheet. Playback starts when the entity
   spawns.
4. Give `audioSource.onEvent` an event kind or the name of an emitted trigger.
5. Make hazards sensors. Only a non-sensor body collects a `collectible`.

Collider `category` and `mask` are unsigned 32-bit bitsets. They default to `1`
and `4294967295`. A pair interacts only when each mask includes a category bit
from the other collider. Give bullets masks that exclude other bullets when
bullet-to-bullet interaction is unnecessary.

Contacts report `phase: "enter" | "stay" | "exit"` and `normalX`/`normalY`.
Check both `entityId` and `otherId`, since each pair emits one contact per tick.
Built-in triggers fire on entry. Use `stay` contacts for repeated overlap logic.
Swept collisions detect fast movement through thin static walls and sensors.
Scene entry starts authored entities' animation and lifetime clocks, and saves
preserve those clocks and active contact pairs.

Runtime event and spawned-instance limits stop the session when exceeded.
A failed tick cannot be saved or resumed. Reset the session or load a snapshot
from before the failure, then reduce overlapping pairs or spawning.

Validation rejects unsupported component fields. Movement and patrol require a
kinematic body, animation requires a sprite, and asset media kinds must match
their image or audio components. Resolve validation errors before publishing.

## Scope

The current runtime supports 2D scenes. Future 3D games will use this built-in
engine with explicit 3D scene and physics types. A glTF model is an asset, so use
`nodetool-3d-scene` to edit one. Existing external-engine source files can remain
in a workspace as files; their scripts and scenes need reconstruction in the
built-in game document to become playable.

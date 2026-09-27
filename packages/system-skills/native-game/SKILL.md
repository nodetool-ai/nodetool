---
name: native-game
description: "Build or revise a playable 2D game in NodeTool's built-in engine, install generated assets, playtest it, and prepare a standalone web build."
---

# Build a native game

Create and edit a versioned built-in game document. The engine owns simulation,
rendering, and web export. A new game starts as a playable top-down room.

## Build and revise

1. `create_native_game {project_id, name}` creates a playable draft and returns
   its full id and current immutable revision. Resource ids may be full ids or
   exact 12-character prefixes.
2. `get_native_game {game_id, view: "outline"}` reads the compact draft outline.
   Use `view: "entity"` with `entity_id` for one entity or `view: "full"` for
   the whole document. `source: "revision"` reads an immutable revision.
3. `edit_native_game {game_id, base_updated_at?, ops}` applies ordered ops to
   the draft and validates the result atomically. Use the `draft_updated_at`
   from a read for compare-and-swap when an edit depends on that exact state.
   Invalid edits return an op index and field path.
4. `capture_native_game_frame {game_id, ticks?}` renders draft frames. Look at
   the returned image before reporting visual changes as complete.
   `playtest_native_game {game_id, inputs?, assertions?, capture_ticks?}` runs
   the draft for up to 3,600 ticks. An input can repeat with `ticks`.
5. `generate_game_asset {game_id, slot, kind, prompt}` generates, prepares,
   installs, and binds an image, speech audio, or music asset. Use
   `reference_slot` for image-to-image generation from an installed slot.
   For a slow model, pass `background: true`, await the returned generation,
   then call `generate_game_asset` again with `generation_id` and the same
   game, slot, kind, prompt, and preparation to install its output.
   `install_native_game_asset {game_id, slot, binding,
   candidate_workspace_id?}` installs a staged candidate and binds it to the
   draft. The staged bytes must match `binding.digest`.
6. `publish_native_game {game_id, base_revision}` publishes the current draft
   only when the user asks. On a conflict, read the draft and reconcile edits.
7. `build_native_game {game_id, revision?}` writes a standalone web player for
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
Set `fontId` to a logical font binding for a HUD label. Font assets use
`mediaKind: "font"`, `fontFormat: "ttf" | "otf"`, and `required: true` by default.
Required fonts load before the first frame or fail play and capture; an optional
font (`required: false`) reports a fallback before play. Export embeds the
font bytes for offline use. Fonts and other prepared assets require
`schemaVersion: 2`.

For generated art, pass one style entity with a reference image. The guided
graph sends that image through an image-to-image generation input for every
visual slot. `StageGameAssets.preparation` accepts per-slot alpha trimming,
target size with a crop policy, pivot, nearest or linear sampling, and mirror
tiling for single images. Trimming records crop offsets so placement keeps its
anchor. `StageGameAssets.fonts` stages TrueType or OpenType assets by logical
font ID.

1. Use `sprite.blend: "additive"` for light drawn on black, such as glows and
   sparks. Set `sampling: "linear"` on painted or soft assets.
2. Use `lifetime {ticks, fade, endScale}` for particles. A kinematic body without
   a collider moves but never collides, which keeps particles cheap.
3. Use `animator` frames on a sprite sheet. Playback starts when the entity
   spawns.
4. Give `audioSource.onEvent` an event kind or the name of an emitted trigger.
   Set `audioSource.volume` from `0` to `1` for effect loudness. Effects receive
   distinct voice ids, so repeated triggers can overlap within the 32-voice cap.
5. Make hazards sensors. Only a non-sensor body collects a `collectible`.

For schema version 2, set `scene.music` to an installed audio `assetId` for
looping music. `volume` ranges from `0` to `1`; `fadeInTicks` and `fadeOutTicks`
range from `0` to `600`. Music starts at the scene's entry tick. Pause suspends
audio, reset restarts the entry scene once, and loading resumes the loop at the saved
logical tick. Browser playback starts after a user gesture. A missing or
undecodable audio asset is reported in the player.

Schema version 2 supports `visualAnimation` on sprites. Its `tracks` animate
`rotation`, `scaleX`, `scaleY`, `opacity`, or `tint` from `from` to `to` over
`durationTicks`. `delayTicks`, `repeat`, `pingPong`, and `easing` control timing.
`rotationRate` adds radians per tick for continuous spins and cannot share a
rotation track. Each property has at most one track. Tracks start at scene entry
or spawn time. The visual order is authored transform and sprite values, tracks,
script `setVisual`, then lifetime fade and scale. Tracks do not change collision.

Scene `backgrounds` define image layers independent of entities. Each layer
sets `assetId`, world-unit `width` and `height`, `origin` at the tile center,
`layer`, per-axis `parallax`, `scrollRate` in world units per second, and `mode`
(`none`, `repeat`, or `mirror`). Parallax `0` stays fixed to the screen and `1`
stays fixed in the world. Optional `frame` selects an atlas rectangle.

Schema version 2 also accepts scene `lighting`: an `ambient` color and intensity
plus up to 32 `points` with world position, color, intensity, radius, and
falloff. Lighting multiplies world color before effects. HUD stays unlit. Set
`sprite.unlit: true` for emissive art such as glows; Canvas2D capture paints
these sprites above the lit world.

Schema version 2 accepts an ordered `renderEffects` chain of at most eight
effects. `brightnessContrast` uses `brightness` from `-1` to `1` and `contrast`
from `0` to `4`. `bloom` uses `threshold` from `0` to `1`, `softness` from `0`
to `0.5`, `radius` from `0` to `64` pixels, and `intensity` from `0` to `4`.
`lut` refers to an opaque packed 2D cube image with dimensions `size² × size`
and an optional intensity and color domain. Effects run in listed order. Set
`hudEffectOrder` to `afterEffects` to keep text crisp, or `beforeEffects` to
process HUD with the world. A bloom chain defaults to `afterEffects`.
`required: true` makes unsupported GPU effects fail before play or capture;
optional effects are omitted with a diagnostic on Canvas 2D.

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

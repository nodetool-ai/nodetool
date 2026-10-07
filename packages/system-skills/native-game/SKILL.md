---
name: native-game
description: "Build or revise a playable 2D or 3D game in NodeTool's built-in engine, install generated assets, playtest it, and prepare a standalone web build."
featured: true
---

# Build a native game

Create and edit a versioned built-in game document. The engine owns simulation,
rendering, and web export. The default is a playable 2D top-down room.
Use `dimension: "3d"` for an exploration blockout with a capsule controller,
follow camera, ramps, a moving platform, a crate and scripted interactions.
Load `game-direction` before the first edit of a new game or a requested art
overhaul. Lock its style string, layer plan, feel parameters, and pacing sheet,
then keep later edits and asset prompts consistent with that spec.

## Build and revise

1. `create_native_game {project_id, name, dimension?}` creates a playable draft and returns
   its full id and current immutable revision. Resource ids may be full ids or
   exact 12-character prefixes.
2. `get_native_game {game_id, view: "outline"}` reads the compact draft outline.
   Use `view: "entity"` with `entity_id` for one entity or `view: "full"` for
   the whole document. `source: "revision"` reads an immutable revision.
3. `edit_native_game {game_id, base_updated_at?, ops}` applies ordered ops to
   the draft and validates the result atomically. Use the `draft_updated_at`
   from a read for compare-and-swap when an edit depends on that exact state.
   Invalid edits return an op index and field path.
   A generated level can replace the whole draft with
   `ops: [{op: "set_document", document}]`. Build it in local loops with
   `@nodetool-ai/sandbox-game`, then call `saveGame` once. The replacement
   preserves the stored game id and revision and supports undo.
4. `capture_native_game_frame {game_id, ticks?}` renders draft frames. Look at
   the returned image before reporting visual changes as complete. Captures
   report `cancelled`, `wall_time_limited`, and `route_complete`. An interrupted
   capture returns only frames rendered before interruption.
   `playtest_native_game {game_id, inputs?, assertions?, capture_ticks?}` runs
   the draft for up to 18,000 ticks, subject to the wall time budget. An input
   can repeat with `ticks`. `justPressed` fires on the first repeated tick.
   `autoplay_native_game {game_id, target_prefix? | win?, player_id?, seed?,
   max_ticks?}` steers a supported player and returns an executed `route`,
   observed win tick, target contacts, and authored level stats. Replay `route`
   as playtest `inputs` with the same seed. Standard direction actions and a
   jump action are supported. A prefix selects every matching authored
   collider, whose IDs must be unique across scenes. Win steering targets
   collectibles or an authored `win` or `victory` trigger. Other scripted goals
   need `target_prefix`.
   A failed steering search or exhausted budget does not prove the game
   impossible. Inspect captures against the direction spec before reporting
   visual quality or polish.
   Assert `{event: "win", before_tick}` to require an engine win or a scripted
   `win`/`victory` trigger. Assert `{event: "victory"}` or another emitted
   event name for a specific scripted signal. A target contact alone does not
   prove completion. Check `route_complete` before accepting a replay.
5. `generate_game_asset {game_id, slot, kind, prompt?, input_file?}` generates,
   prepares, installs, and binds an image, speech audio, music, sound effect, or
   font asset. `audio` is speech. `sfx` uses an explicit registered
   `node_type` and its `params`, or imports an existing audio file. `font`
   imports a TrueType or OpenType `input_file`; it has no generation model.
   An `input_file` is an owned asset URI or current workspace path. Use
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
   screen the 2D player adds a floating stick for `left`/`right`/`up`/`down` and one
   button per other input action, labeled with the action name. Installed
   media must still exist, match its recorded digest, and use a supported format.

## Build a complete document

Load the `sandbox-game` pack skill for the helper signatures and an example.
It exports `game`, `entity`, `script`, `registerAssets`, `fill`, `plank`, `arc`,
and `saveGame`. Asset registration records bindings; installation supplies the
bytes. `saveGame({name, document}, {games: nodetool.games, project_id})` creates
a game and saves the generated draft in one edit. To replace an existing draft,
pass `game_id` and its last-read `base_updated_at` instead of `project_id`.
Publish separately when requested.

`list_example_games {query?}` discovers shipped references.
`get_example_game {slug: "kindle"}` reads its outline. Use `view: "entity"`
with `entity_id` to study the controller or `view: "full"` for the document.
Kindle is the platformer benchmark for layered art, aligned poses, terrain
edges, feel, and pacing. `install_example_game {project_id, slug}` copies a
bundle and its verified media into the project. A raw example document has
`package://` bindings; install the bundle before editing it as a user game.

## Asset preparation

Image preparation supports alpha trim, target size and crop policy, pivot,
sampling, and mirror tiling. Choose at most one of these atlas or grade modes:

| Preparation | Result |
|---|---|
| `sheet: {cols, rows, baseline?}` | Slices a row-major sheet, trims each pose, and aligns the feet on one output row. Returns equal-sized atlas `frames` and bindings named `<slot>.frame.<index>`. `baseline` is a zero-based output foot row. |
| `tileset: {tileWidth?, tileHeight?, edges?, highlight?, shadow?}` | Builds 16 terrain variants with baked exposed-edge treatments. Returns `tiles` and `<slot>.tile.<mask>` bindings. Mask bits are top `1`, right `2`, bottom `4`, left `8`. |
| `lut: {size?, brightness?, contrast?, saturation?, lift?, gain?, gamma?}` | Creates an opaque packed `size² × size` color cube from numeric grade settings, without a generation model. Bind it to a `lut` render effect. |

Use returned atlas rectangles as animator frames or tile frames. Keep the
locked style string in every generated visual prompt. Review foot alignment,
terrain joins, lighting, and grade in captures before accepting the art pass.

For a workflow-based brief, `design_game` writes its design and `build_game
{workflow_id, save?}` creates or selects the native game and stages its asset
graph. The graph's generated media are candidates until installed. A game
revision can be played in the workspace. The `nodetool game` CLI validates,
simulates, captures, and builds a standalone web player from a game document.
`simulate --assertions <file>` checks selected ticks for scene, entity position,
active state, and ordered events. `simulate --verify-replay` restores a midpoint
snapshot and reports the first tick and field that differ from continuous play.

## 3D authoring

Create with `dimension: "3d"` and optional `template: "exploration"`.
The document uses `schemaVersion: 3`, `engineVersion: "2"`, meters, Y up,
forward `-Z`, and quaternion rotations `[x, y, z, w]`. A game keeps its dimension.
Read the returned outline before editing. The 2D sandbox helpers and sprite
preparation below retain their 2D contracts.

Keep controller, body, collider and interactions on a gameplay root. Put the
replaceable model on a visual child using `parentId`. Physics roots have unit
scale and one pose owner. `character3d` requires a kinematic body and a capsule.
Dynamic props use primitives or prepared convex hulls. Triangle meshes require
static bodies. Collision category and mask use 16 bits in 3D. Each scene names
one `activeCameraId`. The camera supports perspective or orthographic projection
and fixed or follow behavior.

`generate_game_asset {game_id, slot, kind: "model", input_file, preparation?}`
imports an owned GLB or glTF. Provider generation requires an explicit registered
`node_type` with its `params`. Preparation normalizes dependencies to a closed
GLB, records bounds and stable `node:<index>`/`clip:<index>` selectors, and checks
resource budgets. Import settings specify `scale`, `forward` and `origin`.
For glTF with separate files, pass `dependency_files` as a map from declared
buffer or image URI to an owned workspace path. Unresolved dependencies fail
preparation.
Model and collider results are candidates. Review them, then call
`install_native_game_asset` with the returned binding and draft timestamp.
Reinstall after editing source model bytes. The existing model editor edits
model assets. Gameplay stays in the game document.

A `set_prefab` definition includes `rootId`, `entities`, `externalAssets` and
`externalScenes`. `instantiate_prefab` clones that subtree with a new
`instance_id` and remaps internal entity references. Each runtime instance owns
its script state, physics bodies and animation state. Bind prepared clips through
`animator3d.clips`. An idle/run/jump rig can replace the placeholder visual
without changing its root controller or collider.

3D script input adds analog `axes`, `look`, XYZ `entity.position`/`velocity`,
`grounded`, world entities and query observations. It preserves isolated JSON
state, seeded `random`, and previous-tick event delivery. Use `characterIntent`
for character motion, `setKinematicPose` for kinematic targets, `impulse` or
`setVelocity` for dynamic bodies, and `teleport` for explicit discontinuities.
`setVisual` changes only a nonphysical visual. `spawn` accepts a prefab and XYZ
position, rotation and velocity. Shared `emit`, `hud`, `playAnimation`, `despawn`
and `sceneTransition` commands retain their meanings. Ray and shape queries are
bounded commands with a caller-supplied `queryId`. Results arrive in the next
tick. Scripts receive no Three.js or Rapier objects.

Playtests accept run-length frames with `pressed`, `justPressed`, `axes`, `look`
and `ticks`. Use XYZ `near`, region and `grounded` assertions to check motion.
Set `restore_at_tick` with a `replay_matches` assertion to compare restored
continuation against the recorded route. `autoplay_native_game` reports 3D as
unsupported. Supply a route and a win assertion. Capture the same source,
revision, seed and inputs to review actual WebGL2 frames and state hashes.
Browser capture requires Chromium. A failed tick invalidates the session.
Reset or restore a snapshot from before the failure.

`build_native_game` exports a self-contained directory for an immutable revision.
Serve it over static HTTP. Models, colliders, fonts, audio and pinned runtime
files are included. The first 3D release targets desktop web and Electron.

## 2D scripts and visuals

A `script` behavior is a function expression. It receives `{tick, pressed,
justPressed, events, entity, world, state, random}` and returns `{state,
commands}`. `events` are the previous tick's events. `world` lists every active
entity with a collider or camera as `{id, source, x, y}`. `entity` holds the
caller's `id`, `source`, position, velocity, and `touching {down, up, left,
right}`, which names the sides of its collider that rest against a solid at the
start of the tick. A spawned instance has
the id `<prefab>#<n>`, its `source` is the prefab id, and it runs the prefab's
script with its own state.

Each call evaluates its source in a fresh sandbox context. Store persistent
values in returned `state`. Closure variables, globals, and mutations of input
objects do not survive or reach another script. Source initialization also uses
the seeded random generator. `maxTickMs` limits each call, subject to the total
script budget for the tick. Source and input/output limits count UTF-8 bytes.

The commands are `setVelocity`, `setPosition`, `setVisual {tint?, opacity?,
rotation?, scaleX?, scaleY?, flipX?}`, `playAnimation {clip}`, `spawn {prefabId,
x?, y?, velocityX?, velocityY?}`, `despawn`, `emit`, `sceneTransition`, and
`hud {id, text, x, y, size?, color?, align?}`. HUD coordinates are canvas pixels. Empty text removes a
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
   spawns. Named `animator.clips` hold other frame sets. `playAnimation` starts
   a clip from its first frame, and a repeated request for the current clip
   continues it. Set `sprite.flipX` or the `setVisual` flag to mirror art, or
   `sprite.faceMotion: "left" | "right"` to turn art that faces that way toward
   the body's horizontal motion.
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
(`none`, `repeat`, `repeatX`, or `mirror`). `repeatX` tiles only sideways, which
suits a strip of scenery. Parallax `0` stays fixed to the screen and `1`
stays fixed in the world. Optional `frame` selects an atlas rectangle.

Schema version 2 also accepts scene `lighting`: an `ambient` color and intensity
plus up to 32 `points` with world position, color, intensity, radius, and
falloff. Lighting multiplies world color before effects. HUD stays unlit. Set
`sprite.unlit: true` for emissive art such as glows; Canvas2D capture paints
these sprites above the lit world. An entity `light2d {color, intensity, radius,
falloff, offset?}` moves with its entity. Each frame adds the entity lights
nearest the camera to the scene's fixed points, up to 32 lights in total.

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

## Platformers

Schema version 2 supports side-view physics.

1. Set scene `gravity {x, y}` in world units per second squared. Kinematic
   bodies fall at `body2d.gravityScale` times the gravity, which defaults to
   `1`. Give particles `gravityScale: 0` when they must float.
2. A body that strikes a solid loses the velocity that pushed into it. A resting
   body therefore keeps zero fall speed, and a script can add a jump to
   `entity.velocityY`.
3. Mark a tilemap `solid: true`, or a single tile `solid`, to make its tiles
   static colliders. Tilemap `category` and `mask` filter them. Faces shared by
   neighboring solid tiles never stop a body, so a body slides along a row of
   tiles without catching on the seams.
4. A `oneWay` collider or tile stops only a body that falls onto its top.
   A body passes through it from below and from the sides.
5. A static body with a velocity, from `patrol` or a script, is a moving solid.
   It carries the bodies that stand on it and pushes out bodies in its way.
6. A patrolling kinematic body turns when a wall blocks it. Set
   `turnAtLedges: true` on an x-axis patrol to also turn at the edge of its
   ground.
7. Frames omit tiles far outside the camera, so a large tilemap costs little to
   draw.

Runtime event and spawned-instance limits stop the session when exceeded.
A failed tick cannot be saved or resumed. Reset the session or load a snapshot
from before the failure, then reduce overlapping pairs or spawning.

Validation rejects unsupported component fields. Movement requires a kinematic
body, patrol requires a body, animation requires a sprite, and asset media kinds must match
their image or audio components. Resolve validation errors before publishing.

## Scope

The runtime supports separate 2D and 3D games. Mixed dimensions, multiplayer,
terrain streaming, navigation meshes, vehicles, ragdolls, retargeting and root
motion are outside this release. A glTF model is an asset, so use
`nodetool-3d-scene` to edit one. Existing external-engine source files can remain
in a workspace as files; their scripts and scenes need reconstruction in the
built-in game document to become playable.

## Workstream authoring reference

The sections below group authoring instructions by their implementation owner.

### K: Editor stabilisation

Viewport movement and keyboard nudges use world directions and store parent-local
transforms. Reparenting preserves the world pose. Parent choices exclude the
entity and its descendants. When selecting an ancestor and descendant together,
move or delete the ancestor once.

Publish validates the document you reviewed, flushes edits, and checks its draft
token and digest. If edits arrive during the flush, review the updated draft
before publishing again. Restoring a revision requires confirmation because it
replaces the draft and clears its undo history. The newest 100 published
revision files are retained, including the live revision.

When the script pane reports a draft conflict, local typing remains unsaved
until you choose **Keep my version** or **Use draft version**. Keeping your
version saves the current text and resumes normal editing. Using the draft
discards the local text. The editor saves at most 1,024 operations per request.
The changes panel receives at most 1 MiB of recent history and omits a group
that would cross the byte limit instead of splitting its undo operations.

### W: Foundation interfaces

The 3D session runs input, scripts, character movement, physics, contacts,
gameplay rules, animation presentation, and presentation events in that order.
Animation commands take effect during the script phase. The animation phase
updates hierarchy and camera presentation, then finalizes simulation events, RNG,
and tick state. The presentation system only mirrors the committed output.
Feature systems live in `packages/game-runtime/src/systems/`. The 2D session retains its existing
movement and script ordering through input, scripts, physics, contacts, gameplay,
and presentation phases.

Each `GameSystem` exposes `init`, `step`, `snapshot`, and `restore`.
`GameSystemPipeline` initializes and steps systems in registration order. It
restores them in reverse order so gameplay restores entities before spatial
adapters restore their state. Stateful systems expose their existing session
state through these methods. Stateless systems snapshot to `null`. This lifecycle
preserves the public session snapshot format.

For runtime diagnostics, open a session with `recordTimings: true` and read
`step(input).timings`, a `GameStepTimings` value with `systems` entries containing
`system` and `durationMs`, plus `totalMs`. Timing measurements are disabled by default and are not
saved. Read `session.takePresentationEvents()` after each tick to consume the
latest tick's presentation events. Consuming them does not change gameplay events
or snapshots. The channel is empty after restoring a session.

### B: Benchmarks and verification

Run `nodetool game bench <file> --json` to measure simulation tick and script
latency percentiles. Use `--ticks` and `--warmup` for measured and warmup tick
counts. The report separates heap delta from sampled JavaScript
allocation bytes. `perSystemMs` reports each runtime system's measured latency
percentiles. Warmup and allocation-profiler ticks are excluded from these stage
samples. Benchmark sessions enable timing instrumentation, which adds clock
calls and timing records. Default gameplay sessions keep it disabled.

For browser rendering, run the game-renderer workspace's `benchmark:effects`
script with `--game <3d-file> --assets-dir <directory>`. It renders 600 frames
through the capture path and reports GPU-completed frame latency, draw calls,
triangles and the browser version.

After export, run `nodetool game smoke <directory>` to load the built player in
Chromium and render 300 frames with scripted input. It reports browser errors,
missing assets and stalled ticks, and exits nonzero on failure. Add `--json`
for the machine-readable report.

### R: 3D rendering

### V: 2D rendering and visual effects

### P: Physics

### A: Audio

### N: Animation

### S: Scripting and gameplay

### U: Input and game UI

### G: Navigation and AI

### E: Editor tools

### C: Content and assets

### D: Performance and delivery

### M: Milestone games

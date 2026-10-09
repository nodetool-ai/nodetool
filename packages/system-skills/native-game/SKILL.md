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
   only when the user asks. For an explicit `document`, pass the paired
   `draft_updated_at` returned by `get_native_game` as `base_updated_at`. On a
   conflict, read the draft and reconcile edits.
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

## Entity tags and properties

Both dimensions support optional `tags` and `props` on an entity. A 2D game
needs `schemaVersion: 4` with `engineVersion: "3"`. Schemas 1 and 2 reject the
fields, keep engine 1 and give scripts no metadata. New 2D games start at
schema 4. Use
`update_entity` with `set: {tags: ["hero"], props: {health: 10}}`. Each field
replaces its complete value. A top-level `null` removes the stored field.
Nested `null` is JSON data. Tags are unique, with at most 64 strings of
1–128 characters. Properties hold finite JSON, with at most 64 top-level keys,
16 levels of nesting and 64 KiB of UTF-8 JSON. Keys contain 1–128 characters.
`__proto__`, `constructor` and `prototype` are rejected at every nesting level.

Scripts read `entity.tags`, `entity.props`, `entity.active` and
`entity.rotation`, and the same fields on existing `world` entries and
`world.get(id)` results. `world.query({tag})` returns the ids carrying a tag.
Rotation is radians in 2D and the committed world quaternion `[x, y, z, w]` in 3D.
Use `setProp {key, value}` and `removeProp {key}` to change the caller's
runtime properties. Setting `null` keeps that key. Removal deletes it. The
runtime checks every property command in a tick before it changes any state,
and an error names the entity and tick. Each entity's props count once
toward the 64 KiB script input limit. Runtime properties survive snapshot restore and remain independent of the
authored document and other prefab instances. Mutating an input object does
not change runtime state.

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

Store persistent values in returned `state`. The engine keeps a function
resident only when an AST check proves its expression can read input without
retaining hidden state. Sources are validated during preparation in temporary
contexts. A resident function is compiled on its first active call and reused
while that behavior instance remains active. Other sources evaluate in a fresh context each call,
preserving closure, global, and input-mutation isolation. The resident path
passes native sandbox values and creates a private mutable `input.world` copy
only when read. The compatibility path retains JSON normalization and guest
parsing, with call data passed as a native string rather than evaluated source.
Source initialization uses the seeded random generator. `maxTickMs` limits
each call, subject to the total script budget for the tick. Source and
input/output limits count UTF-8 bytes.

During a function call, global `world.get(id)` returns an entity or `undefined`,
and `world.query({source?, tag?, near?, radius?, limit?})` returns matching IDs
in runtime entity order. Both use the same immutable tick-start snapshot,
before movement behaviors or script commands run. Returned values are private copies.
Queries cover every active entity. Legacy `input.world` keeps its existing
shape and population, including only collider or camera entities in 2D.
The 2D query record is `{id, source, x, y, velocityX, velocityY, grounded}`.
The 3D record is `{id, source, position, velocity, grounded}`, with XYZ vectors.
3D records and schema 4 2D records add `tags`, `props`, `rotation` and `active`.
A `tag` filter matches only entities that carry the tag.
Pass `near: {x, y, z?}` and `radius` together. The radius is nonnegative and
includes entities on its boundary, measured between centers, with omitted
`z` treated as zero. `source` matches the record's original entity ID, not a 3D
prefab asset ID. Documents
have no authored tags yet, so a `tag` filter returns no matches.
`limit` is an integer from 0 to 1024, defaulting to 1024. A call allows 64
combined `get`/`query` attempts. Exceeding the count fails the call even if
guest code catches it. Query arguments allow 4096 JSON characters, `get` IDs
1024 characters, and responses
64 KiB, within the existing time and memory budgets. These APIs are unavailable
during source initialization. They are additive: 3D `contractVersion` stays 3,
with no document schema bump or migration.

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

Both editor controllers render through `GameEditorShell`. Register panel
metadata with `createGamePanelRegistry().register()` or the shared
`gamePanelRegistry.register()`, including its ID, title, icon, supported
dimensions and default region. Registration returns an idempotent disposer.
Controllers supply nodes keyed by registered IDs and retain document, save,
publish, restore and session ownership. The shell routes those nodes to their
declared regions and owns toolbar, docks, status and editor keyboard scope.

Game draft history exposes labelled commands through `commandHistory.past` and
`commandHistory.future`, with `canUndo` and `canRedo` selectors. Each command
retains forward and inverse document operations. Viewport producers begin a
gesture after selection changes and share its ID and merge key across selected
roots. The whole drag becomes one command. End the gesture on release,
cancellation, lost capture, blur or unmount. Selection, save acknowledgements and
server loads do not create commands. Undo and redo rebuild only the unsent save
suffix from the confirmed draft plus any protected submitted prefix. A lost save
response keeps that prefix protected until acknowledgment or authoritative
recovery. Controllers capture that exact prefix for retry before submitting the
remaining suffix. Ordinary 3D edits use granular
operations, including explicit null patches to remove scene music or collision
layers. Internal diffs reserve document replacement for retained authoring definition
changes. Apply those changes through the existing authoring preview/apply
boundary.

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

A 3D scene's `environment.sky` sets its background and image-based lighting.
Omit it, or use `{ kind: "color" }`, for the solid `background` color without
environment lighting. That is the default and renders exactly as before.

`{ kind: "procedural", sunEntityId?, turbidity, rayleigh, groundColor, intensity }`
renders a physical sky. Its sun follows `sunEntityId`, which must name a
directional light in the same scene. Without it, the sun follows the scene's
first directional light. Rotate that light to move the sun. `turbidity` (1 to 20,
default 10) adds haze. `rayleigh` (0 to 4, default 2) deepens blue and sunset
tones. `groundColor` fills the lower hemisphere.

`{ kind: "hdri", assetId, rotation, intensity }` uses an `hdri` asset binding: a
2:1 equirectangular `.hdr` or `.exr` of at most 2048×1024 and 16 MiB. `rotation`
turns it about +Y in radians. HDRI candidates cannot be installed until HDRI
preparation ships. A renderer without an HDRI decoder draws the background color
and reports a diagnostic in the capture stats.

`intensity` (0 to 8, default 1) scales both the sky background and its
reflections. Metal and glossy materials reflect the sky. Ambient light still
adds on top, so lower `ambient.intensity` when the sky lights the scene. Set the
sky with `update_scene`. It replaces the whole `environment`, so send the
existing `background`, `ambient`, `fog` and `shadows` with the new `sky`.
Capture the scene to review the result.

### V: 2D rendering and visual effects

Add particle effects with the `particles` component on any 2D (schema 2 or 4)
or 3D entity. It holds up to 8 `emitters`, each with a unique `id`. An emitter
sets `rate` (particles per second), `bursts` (`time`, `count`, `cycles`,
`interval`), `duration`, `loop`, `playOnStart`, `maxParticles` and a `shape`:
`point`, `circle`, `sphere`, `cone`, `box` or `edge`. Cone, box and edge emit
along local +Y. Point, circle and sphere emit outward. Per-particle values
`lifetime`, `speed`, `size`, `rotation` and `angularVelocity` take a number or
`{ min, max }`. `color` takes `#rrggbb` or `{ min, max }`. The
`sizeOverLifetime`, `speedOverLifetime` and `opacityOverLifetime` curves are
lists of `{ t, value }` keys sorted by `t` from 0 to 1.
`colorOverLifetime` uses `{ t, color }` keys. Add `gravity`
(`{ x, y, z }` in units per second squared) and `drag`. `space: "local"` makes
particles follow the entity. `onDeath: [{ emitter, count }]` fires another
emitter of the same component where each particle dies. Give that emitter
`playOnStart: false` and `rate: 0`.

Scripts trigger emitters with `{ kind: "emitParticles", emitter?, count? }` on
their own entity. Without `count`, the emitter restarts its cycle, which suits a
one-shot explosion with `loop: false`. With `count`, that many particles spawn
at once. Omitting `emitter` selects the first emitter in the component's `emitters` list. The command is a presentation
event from `takePresentationEvents()`. It never appears in gameplay events or
snapshots. Particles cannot affect scores, physics or scripts. Prefer them over
spawned prefabs for sparks, smoke and dust.

The renderer simulates particles with `ParticleSimulator` from
`@nodetool-ai/game-renderer`. Each tick, call `sync(particleSourcesFromFrame(frame))`,
`emit(session.takePresentationEvents())` and `step(seconds)`, then read
`forEachParticle`. One `step` simulates at most 0.25 seconds, so a resumed tab does not replay a long pause. Each emitter's random stream is seeded from its entity and
emitter ids, so captures repeat. The built-in players do not draw particles yet.

### P: Physics

2D `schemaVersion: 5` with `engineVersion: "4"` is reserved for Rapier 2D
physics. This runtime does not provide that engine yet, so validation and
sessions refuse such a document with the `engine_unavailable` diagnostic. Do not
author schema 5. Keep 2D games on schema 4 with engine 3, or on schemas 1 and 2
with engine 1. A schema must use its own engine version.

### A: Audio

Set the document mix with `set_audio {mixer}` in 2D and 3D. `set_audio
{mixer: null}` removes it. Every mixer has the buses `master`, `music`, `sfx`,
`voice` and `ui`. Add buses under `mixer.buses` with `parent` (default
`master`), `volume` (linear, 1 is unity), `muted`, `lowpassHz` and
`reverbSend`. A bus multiplies its parent's gain, so muting `sfx` silences its
children. Scene music plays on `music` and other audio on `sfx` unless
`mixer.assetBuses` maps the asset slot to another bus.

The master bus ends in a limiter at `limiter.thresholdDb` (default -1 dB) that
does not change levels below the threshold. The default ducking rule lowers
`music` to 0.35 while a voice plays on `voice` or a child of it. Replace
`ducking` to change or remove that rule.

A mixer snapshot under `mixer.snapshots` overrides named fields of named buses.
`transitions` move to a snapshot over `fadeTicks` when the simulation emits a
`trigger` event, a `win` event, or enters a scene. The snapshot `base` returns
to the base mix. Restarting or restoring a session returns to the base mix or
the scene's snapshot without a fade.

The mix is presentation state. The player reads simulation events for
transitions but never writes back, and the mix is not saved in game snapshots,
so a mixer edit never changes `nodetool game simulate` results or replay.
Players can scale and mute a bus at runtime through `GameAudioPlayer`
`setBusVolume` and `setBusMuted`.

### N: Animation

### S: Scripting and gameplay

#### Script parameters

Declare a script's tunables as `params` on its script behavior instead of
constants in the source. The inspector edits them and scripts read the values
on `input.params`. Set them with `set_script_params {entity_id, scene_id?,
index, params?, values?}`. `params` replaces the declarations and `null`
removes them with their values. `values` merges stored values, and a `null`
value returns one to its default. 2D games need schema 4. 3D games accept
params on schema 3.

```json
{"op": "set_script_params", "entity_id": "player", "index": 0,
 "params": {"speed": {"type": "number", "default": 3, "minimum": 0, "maximum": 10},
            "target": {"type": "entity"}, "hit": {"type": "asset", "kind": "audio"}},
 "values": {"speed": 5, "target": "goal"}}
```

Types are `number` (`minimum`, `maximum`, `integer`), `boolean`, `color`
(`#rrggbb`), `enum` (`options`, default the first option), `entity`, `asset`
(optional `kind`) and `vector` (`dimensions` 2 or 3). A behavior declares at
most 32 params with identifier names. `input.params` holds the stored value,
else the default. An `entity` or `asset` param without either is `null`.
Validation rejects an entity reference outside the behavior's scene, a missing
asset slot, an asset of the wrong `kind`, and in 3D an entity reference inside
a prefab or an undeclared prefab asset. A behavior without `params` has no
`input.params` key. Params count once per behavior definition toward the
64 KiB script input limit.

### U: Input and game UI

### G: Navigation and AI

### E: Editor tools

Both editors provide hierarchy, inspector, revisions, scripts, assets and
assistant panels. Opening another entity keeps an already open script anchored to its
original entity and behavior.

Use **Run 10 s** to diagnose the captured draft in an independent session. The
report includes the first failing tick and script time by entity. Changing the
draft cancels that diagnostic. For a script error, **Replay to tick** rewinds
the active play session's recorded history. It does not replay the independent
diagnostic session. Use **Ask the assistant** to pass the script context to
the game assistant.

Both editors read their commands and default shortcuts from one registry.
Press Ctrl+K (Cmd+K on macOS) to open the command palette. It lists editor
commands with their current shortcuts and assistant actions, such as a
playtest request or a question about the selection. An assistant action writes
the prompt into the assistant input without sending it. **Edit keyboard
shortcuts** in the palette rebinds, removes or resets a shortcut. The editor
rejects a shortcut that another command in the same editor already uses.
Shortcuts are saved per user in the browser.

### C: Content and assets

Call `browse_native_game_assets {game_id}` before replacing or regenerating
art. It returns every bound asset with `usedBy` (the entities, scenes, prefabs
and game settings that reference it), prefabs with their instances, scenes with
the assets they use, the staged candidates under the game's `assets/` folder,
and `slot_requests`. A slot request is the template slot's prompt and image
preparation, or the prompt recorded with the asset now bound. Use it to
regenerate in the same style. Narrow the lists with `query` and `kind`.

`staleSiblings` lists `<slot>.frame.N` and `<slot>.tile.M` bindings that still
point at the slot's previous bytes. Rebind them with `bind_asset` operations
before publishing, or the sheet's animations keep drawing the old art.

To bind a staged candidate, call `browse_native_game_assets {game_id, digest,
slot}`. Pass the returned `binding` and `draft_updated_at` to
`install_native_game_asset`. A recorded binding keeps its frame and
preparation metadata. An unrecorded image or audio file gets a binding derived
from its bytes with the slot's pivot and sampling. A 3D model is prepared
from its GLB. An unrecorded collider cannot be derived and must be restaged.

The editor's **Assets** panel in the bottom dock shows the same catalog with
thumbnails: images from the stored thumbnail, audio as a waveform, and models
rendered by the game renderer. Its search and type filter match the
capability's `query` and `kind`. **Generate** and **Regenerate** run
`generate_game_asset` for image, speech and music slots with an editable
prompt, record the prompt beside the staged file, and install the result with
its frame bindings. The panel stages with `install: false` and binds onto the
draft that is current when the bytes are ready, so edits saved while it runs
stay. **Use** binds an older candidate in place and moves the slot's frame and
tile bindings onto it. Sound-effect, model and collider slots
need a provider node, so the panel drafts the request in the assistant
instead. Candidates staged by `StageGameAssets` and by the panel carry a record
at `<source_root>/candidates/<digest>.json`. Files staged by
`generate_game_asset` itself have none and list as unrecorded.

### D: Performance and delivery

#### Distance culling and frame budgets (3D)

Both are presentation only. They never change simulation, snapshots or replay.

- `set_performance {performance}` replaces document `performance`. `null`
  removes it. `cullLayers` maps a layer name to `{maxDistance}` (at most 32
  layers). `budgets` sets `drawCalls`, `triangles`, `particles` and `voices`.
- `update_entity` with `set: {renderCulling: {layer?, maxDistance?}}` hides
  that entity and its children when the game camera is farther than the
  distance from the entity's origin. The nearest setting in the parent chain
  wins, and an entity's own `maxDistance` wins over its layer's. A layer must
  be declared, or validation reports `missing_cull_layer`.
- Distance is measured to the entity origin, not to its nearest surface. Cull
  props and small decoration. Do not cull large scenery such as terrain or
  buildings, because they disappear while the camera is still close to their
  edges. Never cull the player or anything the player must see to win. The
  editor camera shows every entity.
- Budgets left out use the player defaults: 1000 draw calls, 1,000,000
  triangles, 4096 particles and 24 voices. The standalone player warns in the
  browser console once each time the draw call, triangle or voice budget is
  exceeded. No player counts particles yet, so the particles budget does not
  warn. `nodetool game capture` reports `budget.overruns` for a 3D frame.

### M: Milestone games

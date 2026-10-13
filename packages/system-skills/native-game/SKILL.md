---
name: native-game
description: "Build or revise a playable 2D or 3D game in NodeTool's built-in engine: create and edit the document, generate and install art and audio, playtest and autoplay a route, capture frames, publish, and prepare a standalone web build. Also the entry point for making a game look or feel better. For a glTF model use nodetool-3d-scene. For nodetool.games calls inside a code action use api-games."
featured: true
---

# Build a native game

Create and edit a versioned built-in game document. The engine owns simulation,
rendering, and web export. The default is a playable 2D top-down room.
Use `dimension: "3d"` for an exploration blockout with a capsule controller,
follow camera, ramps, a moving platform, a crate and scripted interactions.

Load `game-direction` before the first edit of a new game, an art overhaul, or
a game that plays but feels flat. Lock its style string, layer plan, feel
parameters, and pacing sheet, then keep later edits and asset prompts
consistent with that spec. Load `native-game-reference` when an edit needs
script hooks, events, lighting, effects, particles, 3D rendering, the audio mix,
animation graphs, input bindings, the HUD tree or performance fields. Load
`api-games` before calling `nodetool.games` from a code action.

## Build and revise

1. `create_native_game {project_id, name, dimension?}` creates a playable draft
   and returns its full id and current immutable revision. Resource ids may be
   full ids or exact 12-character prefixes.
2. `get_native_game {game_id, view: "outline"}` reads the compact draft outline.
   Use `view: "entity"` with `entity_id` for one entity or `view: "full"` for
   the whole document. `source: "revision"` reads an immutable revision.
3. `edit_native_game {game_id, base_updated_at?, ops}` applies ordered ops to
   the draft and validates the result atomically. Use the `draft_updated_at`
   from a read for compare-and-swap when an edit depends on that exact state.
   Invalid edits return an op index and field path. A generated level can
   replace the whole draft with `ops: [{op: "set_document", document}]`. The
   replacement preserves the stored game id and revision and supports undo.
4. Prove it plays.
   `playtest_native_game {game_id, inputs?, assertions?, capture_ticks?}` runs
   the draft for up to 18,000 ticks, subject to the wall time budget. An input
   can repeat with `ticks`. `justPressed` fires on the first repeated tick.
   `autoplay_native_game {game_id, target_prefix? | win?, player_id?, seed?,
   max_ticks?}` steers a supported 2D player and returns an executed `route`,
   observed win tick, target contacts, and authored level stats. It needs a
   player with a `movement` behavior, or a script player with `left` and
   `right` actions, and takes jump from a `jump`, `space` or `up` action. A
   prefix selects every matching authored collider, whose IDs must be unique
   across scenes. Win steering targets
   collectibles or an authored `win` or `victory` trigger. Other scripted goals
   need `target_prefix`. A failed steering search or exhausted budget does not
   prove the game impossible. Replay `route` as playtest `inputs` with the same
   seed, and check `route_complete` before accepting the replay. A target
   contact alone does not prove completion.
5. Assert what the replay proves. 2D playtests accept three forms, and any
   other returns `Unsupported assertion`:
   - `{event: "win", before_tick?}` requires an engine win or a scripted `win`
     or `victory` trigger. `{event: "<name>"}` requires that emitted event.
   - `{entity_id, near: {x, y, tolerance}, at_tick?}` checks a position.
   - `{no_script_errors: true}` fails on the first script error.
   3D playtests add `region`, `grounded` and `replay_matches` (see 3D authoring).
6. Look at it. `capture_native_game_frame {game_id, ticks?, sheet?}` renders up
   to eight frames and returns image refs (`asset_id`, `uri`), not pixels. Call
   `view_image` on each ref you judge, as a direct tool call, before reporting
   visual changes or polish. Inside a code action the pixels cannot arrive.
   `sheet: true` returns one contact sheet. Captures report `cancelled`,
   `wall_time_limited`, and `route_complete`. An interrupted capture returns
   only frames rendered before interruption.
7. Generate assets (see Assets). Confirm scope before spending.
8. `publish_native_game {game_id, base_revision}` publishes the current draft
   only when the user asks. For an explicit `document`, pass the paired
   `draft_updated_at` returned by `get_native_game` as `base_updated_at`. On a
   conflict, read the draft and reconcile edits.
9. `build_native_game {game_id, revision?, target?}` writes a standalone web
   player for an owned revision under the project workspace and returns its
   path, only when the user asks. `target: "tauri"` writes a Tauri desktop app
   project instead, named after the game. It compiles to installers with
   `npm run build` where Rust is installed. On a touch screen the 2D player adds a floating stick for
   `left`/`right`/`up`/`down` and one button per other input action, labeled
   with the action name. Installed media must still exist, match its recorded
   digest, and use a supported format.

## Build a complete document

Author a whole level in a code action with the `@nodetool-ai/sandbox-game` pack.
Read its signatures and an example with
`nodetool.packs.docs("@nodetool-ai/sandbox-game")` (the direct tool is
`get_sandbox_package_docs`). It exports `game`, `entity`, `script`,
`registerAssets`, `fill`, `plank`, `arc`, `constructGame` and `saveGame`. Asset
registration records bindings, and installation supplies the bytes.
`saveGame({name, document}, {games: nodetool.games, project_id})` creates a
game and saves the generated draft in one edit. To replace an existing draft,
pass `game_id` and its last-read `base_updated_at` instead of `project_id`.
`api-games` covers `constructGame` and retained rebuilds. Publish separately
when requested.

`list_example_games {query?}` discovers shipped references.
`get_example_game {slug: "kindle"}` reads its outline. Use `view: "entity"`
with `entity_id` to study the controller or `view: "full"` for the document.
Kindle is the platformer benchmark for layered art, aligned poses, terrain
edges, feel, and pacing. `install_example_game {project_id, slug}` copies a
bundle and its verified media into the project. A raw example document has
`package://` bindings. Install the bundle before editing it as a user game.

For a workflow-based brief, `design_game` writes its design and `build_game
{workflow_id, save?}` creates or selects the native game and stages its asset
graph. The graph's generated media are candidates until installed.

## Scripts during play

Edit an existing script through `edit_native_game` with an `update_behavior`
document op. Supply `entity_id`, `index` and `behavior: {source}` to preserve the
script limits. The editor compiles changed sources
during play and continues at the current tick with
existing script state. A compile failure keeps the previous source running and
reports the error in the Console. Only source edits apply during play. Use
**Restart from tick 0** to apply other draft changes or reset script state.
Changing between a function and lifecycle-object script requires a restart.

A successful reload starts a new replay checkpoint at the current tick. Saved
play states use the accepted script document. Earlier checkpoints belong to
older source code and cannot be loaded into the changed session.

## Assets

Generation spends provider credits, and no tool prices it in advance. Before
the first generation, state which slots, kinds, prompts and models you plan,
and get the user's go-ahead unless the request already authorized that scope.
Do not invent a dollar estimate. Reuse a prior authorization instead of asking
again. Importing an `input_file` and building a `lut` cost nothing. Report
actual spend with `get_cost_summary`.

Call `browse_native_game_assets {game_id}` before replacing or regenerating
art. It returns every bound asset with `usedBy`, prefabs with their instances,
scenes with the assets they use, the staged candidates under the game's
`assets/` folder, and `slot_requests`. A slot request is the template slot's
prompt and image preparation, or the prompt recorded with the asset now bound.
Use it to regenerate in the same style. Narrow the lists with `query` and
`kind`. `staleSiblings` lists `<slot>.frame.N` and `<slot>.tile.M` bindings that
still point at the slot's previous bytes. Rebind them with `bind_asset` ops
before publishing, or the sheet's animations keep drawing the old art.

`generate_game_asset {game_id, slot, kind, prompt?, input_file?, provider?,
model?}` generates or imports, prepares, installs, and binds an asset. `kind` is
`image`, `audio` (speech), `music`, `sfx`, `font`, `model` or `collider`.
`sfx` uses an explicit registered `node_type` and its `params`, or imports an
existing audio file. `font` imports a TrueType or OpenType `input_file` and has
no generation model. An `input_file` is an owned asset URI or current workspace
path. `reference_slot` generates an image from an installed slot's image, which
keeps a new asset in the locked style. `install: false` stages a 2D candidate
without binding it. For a slow model, pass `background: true`, await the
returned generation, then call `generate_game_asset` again with
`generation_id` and the same game, slot, kind, prompt, and preparation.

`install_native_game_asset {game_id, slot, binding, candidate_workspace_id?}`
installs a staged candidate and binds it to the draft. The staged bytes must
match `binding.digest`. To bind an earlier candidate, call
`browse_native_game_assets {game_id, digest, slot}` and pass the returned
`binding` and `draft_updated_at`. An unrecorded image or audio file gets a
binding derived from its bytes. An unrecorded collider must be restaged.

Image preparation supports alpha trim, target size and crop policy, pivot,
sampling, and mirror tiling. Choose at most one of these atlas or grade modes:

| Preparation | Result |
|---|---|
| `sheet: {cols, rows, baseline?}` | Slices a row-major sheet, trims each pose, and aligns the feet on one output row. Returns equal-sized atlas `frames` and bindings named `<slot>.frame.<index>`. `baseline` is a zero-based output foot row. |
| `tileset: {tileWidth?, tileHeight?, edges?, highlight?, shadow?}` | Builds 16 terrain variants with baked exposed-edge treatments. Returns `tiles` and `<slot>.tile.<mask>` bindings. Mask bits are top `1`, right `2`, bottom `4`, left `8`. |
| `lut: {size?, brightness?, contrast?, saturation?, lift?, gain?, gamma?}` | Creates an opaque packed `size² × size` color cube from numeric grade settings, without a generation model. Bind it to a `lut` render effect. |

Use returned atlas rectangles as animator frames or tile frames. Keep the
locked style string in every generated visual prompt. Review foot alignment,
terrain joins, lighting, and grade in viewed captures before accepting the art
pass.

## Audio

Install music in an audio slot, then use `update_scene {scene_id, set: {music:
{assetId, volume, fadeInTicks, fadeOutTicks, streaming}}}` in 2D or 3D.
`assetId` names the installed slot. `volume` ranges from 0 to 1 and each fade
ranges from 0 to 600 ticks. A scene transition overlaps the outgoing fade out
and incoming fade in.

For long tracks set `streaming: {loopStartSeconds, loopEndSeconds?}`. The
browser streams the asset through the music bus without decoding the whole
track. Loop start defaults to 0 seconds. Loop end must exceed loop start,
and both are bounded by 86400 seconds. Omit loop end to loop to the track's
end. Omit `streaming` for decoded music. Loading a snapshot positions music at
the saved logical tick within the loop. Browser audio needs a user gesture.

Use `set_audio {mixer}` for mixer buses and `audioSource` for triggered effects.
See `native-game-reference` § Audio mix and spatial audio for their fields.

## 3D authoring

Create with `dimension: "3d"` and optional `template: "exploration"`.
The document uses `schemaVersion: 3`, `engineVersion: "2"`, meters, Y up,
forward `-Z`, and quaternion rotations `[x, y, z, w]`. A game keeps its
dimension. Read the returned outline before editing. The 2D sandbox helpers and
sprite preparation retain their 2D contracts.

Keep controller, body, collider and interactions on a gameplay root. Put the
replaceable model on a visual child using `parentId`. Physics roots have unit
scale and one pose owner. `character3d` requires a kinematic body and a capsule.
Dynamic props use primitives or prepared convex hulls. Triangle meshes require
static bodies. Collision category and mask use 16 bits in 3D. Shared friction
and restitution belong in named `physicsMaterials` that colliders reference by
`physicsMaterial`. Each scene names one `activeCameraId`. The camera supports perspective or orthographic projection
and fixed or follow behavior.

`generate_game_asset {game_id, slot, kind: "model", input_file, preparation?}`
imports an owned GLB or glTF. Provider generation requires an explicit
registered `node_type` with its `params`. Preparation normalizes dependencies to
a closed GLB, records bounds and stable `node:<index>`/`clip:<index>`
selectors, and checks resource budgets. Import settings specify `scale`,
`forward` (`-z`, `+z`, `+x`, `-x`) and `origin` (`preserve`, `ground`,
`centerGround`). For glTF with separate files, pass `dependency_files` as a map
from declared buffer or image URI to an owned workspace path. Unresolved
dependencies fail preparation. `kind: "collider"` builds collision geometry
from a GLB or glTF, or accepts an already prepared collider JSON, and requires
`preparation.shape`: `convexHull` for a dynamic prop or `triangleMesh` for
static level geometry. Model and collider results are candidates. Review them,
then call `install_native_game_asset` with the returned binding and draft
timestamp. Reinstall after editing source model bytes. The model editor
(`nodetool-3d-scene`) edits model assets. Gameplay stays in the game document.

A `set_prefab` definition includes `rootId`, `entities`, `externalAssets` and
`externalScenes`. `instantiate_prefab` clones that subtree with a new
`instance_id` and remaps internal entity references. Each runtime instance owns
its script state, physics bodies and animation state. Bind prepared clips
through `animator3d.clips`. An idle/run/jump rig can replace the placeholder
visual without changing its root controller or collider.

3D script input adds analog `axes`, `look`, XYZ `entity.position`/`velocity`,
`grounded`, world entities and query observations. It preserves isolated JSON
state, seeded `random`, and previous-tick event delivery. Use `characterIntent`
for character motion, `setKinematicPose` for kinematic targets, `impulse` or
`setVelocity` for dynamic bodies, and `teleport` for explicit discontinuities.
For continuous acceleration, return `{kind: "addForce", force: {x, y, z}}`,
`{kind: "addTorque", torque: {x, y, z}}` or
`{kind: "addForceAtPoint", force: {x, y, z}, point: {x, y, z}}`.
The vectors and application point use world space. These commands act on the
issuing entity's active dynamic body and accumulate for one simulation tick.
Return them each tick to keep applying a load. An offset point also produces
torque. Static, kinematic and absent bodies reject them. 2D scripts do not
support them.
`setVisual` changes only a nonphysical visual. `spawn` accepts a prefab and XYZ
position, rotation and velocity. Shared `emit`, `hud`, `playAnimation`,
`despawn` and `sceneTransition` commands retain their meanings. Ray and shape
queries are bounded commands with a caller-supplied `queryId`. Results arrive
in the next tick. Scripts receive no Three.js or Rapier objects.

3D playtests accept run-length frames with `pressed`, `justPressed`, `axes`,
`look` and `ticks`. Assertions take `{entity_id, near: {x, y, z, tolerance}}`,
`{entity_id, region: {min, max}}` and `{entity_id, grounded}`, each with an
optional `at_tick`, plus the `event` and `no_script_errors` forms. Set
`restore_at_tick` with a `{replay_matches: true}` assertion to compare restored
continuation against the recorded route. `autoplay_native_game` reports 3D as
unsupported, so write the route yourself and assert the win. Capture the same
source, revision, seed and inputs to review actual WebGL2 frames and state
hashes. A failed tick invalidates the session. Reset or restore a snapshot from
before the failure.

`build_native_game` exports a self-contained directory for an immutable
revision. Serve it over static HTTP. Models, colliders, fonts, audio and pinned
runtime files are included. The first 3D release targets desktop web and
Electron.

## Platformers

New 2D games (schema 4) support side-view physics. Older documents need schema
2 or later.

1. Set scene `gravity {x, y}` in world units per second squared. Kinematic
   bodies fall at `body2d.gravityScale` times the gravity, which defaults to
   `1`. Give floating effects `gravityScale: 0`.
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

## Failures and validation

Runtime event and spawned-instance limits stop the session when exceeded.
A failed tick cannot be saved or resumed. Reset the session or load a snapshot
from before the failure, then reduce overlapping pairs or spawning.

Validation rejects unsupported component fields. Movement requires a kinematic
body, patrol requires a body, animation requires a sprite, and asset media kinds
must match their image or audio components. Resolve validation errors before
publishing. `native-game-reference` § Schema versions lists which fields each
2D schema accepts.

## Scope

The runtime supports separate 2D and 3D games. Mixed dimensions, multiplayer,
terrain streaming, navigation meshes, vehicles, ragdolls, retargeting and root
motion are outside this release. A glTF model is an asset, so use
`nodetool-3d-scene` to edit one. Existing external-engine source files can
remain in a workspace as files, but their scripts and scenes need reconstruction in
the built-in game document to become playable.

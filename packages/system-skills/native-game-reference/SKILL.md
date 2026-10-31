---
name: native-game-reference
description: "Field reference for web and native C++ game documents: scripts, lifecycle hooks, events, tags and props, 2D visuals, particles, lighting, effects, 3D rendering, physics layers, audio mix, animation graphs, input bindings, HUD widgets, performance and editor panels. Load after native-game when an edit needs one of these fields."
---

# Native game field reference

## Native C++ document contract

Native C++ documents use `engine: "native-cpp-1"`. Native 3D uses
`schemaVersion: 4`, `dimension: "3d"`, and Jolt. Native 2D uses
`schemaVersion: 5`, `dimension: "2d"`, and the ported TypeScript swept AABB
solver. Call `native_cpp_game_schema {dimension:"2d"}` or the `"3d"` variant
for admitted document, transaction, and command declarations. Schema numbers alone
do not select the engine. The legacy web reference below has a different envelope.

Both dimensions share scenes, prefabs, scripts, prepared assets, input actions,
HUD, audio, document operations, and QuickJS lifecycle. Native 3D transforms use
position in meters, Y-up, quaternion rotation, and unit scale for physics.
Collision layers are 0–15 with 16-bit masks. Both masks must admit the other layer.
Mesh colliders require static bodies.

Native 3D cameras use either a fixed `camera:{position:[x,y,z],target:[x,y,z],fov}`
or a first-person camera:

```json
{"kind":"firstPerson","targetId":"player","offset":[0,0.65,0],"yaw":0,"pitch":0,"sensitivity":0.002,"minPitch":-1.3,"maxPitch":1.3,"fov":78,"near":0.03,"far":160}
```

Place this object in document `camera`. The target must exist in every scene.
The eye follows the target's world position plus the world-space `offset`.
Yaw and pitch are radians, while `fov` is degrees. Session input
`look:{x,y}` contains raw mouse pixels for that tick. The core subtracts
`look.x * sensitivity` from yaw and `look.y * sensitivity` from pitch, clamps
pitch, and preserves the angles in same-session snapshots. Scripts read resolved
`i.camera.position`, `target`, `forward`, `yaw`, `pitch`, `fov`, `near`, and `far`
after that tick's look input. Use this aim state for queries instead of applying
look a second time. Raw look is also available as `i.input.look`.

Committed frames expose the resolved camera for both desktop and browser
rendering. Qt captures use that same camera. Fixed cameras keep their previous
behavior and accept optional clipping planes, defaulting to `near:0.05` and
`far:10000`. In the Qt first-person player, click the view to capture mouse look,
press Escape to release it, or hold the right mouse button and drag. Declared
`inputActions` bindings such as `KeyF` and `KeyR` produce held action states and
are retained alongside raw look in input recordings.

A model visual can set `cameraRelative:true` for a viewmodel. Its entity must be
a root with no body, collider, or character. Its descendants must also remain
nonphysical. Its authored transform is local to the resolved camera. The core emits a world-space frame
pose and removes the presentation marker, so renderers apply no second camera
transform. This changes presentation only and keeps the authored transform and
physical world unchanged.

A scene can instead select `activeCameraId` from its entities. That entity uses
`camera3d:{projection:{kind:"perspective",fov,near,far},behavior:{kind:"fixed"}}`.
Its parent hierarchy places and orients the eye. This mode preserves camera,
weapon, and muzzle child transforms. Native 3D `setVisual` takes a quaternion
at the top level, for example `{kind:"setVisual",rotation:[0,0,0,1]}`. It
replaces the issuing nonphysical entity's local visual rotation. The camera's
resolved `up` vector preserves roll. Follow and orthographic cameras are rejected.

Native 3D presentation frames bake entity hierarchy poses into world TRS and
remove `parentId` from frame entities. Authored documents retain their parent
links and local transforms. Parent scale must commute with child rotation:
uniform scale permits any rotation, while nonuniform scale permits rotations
within equally scaled axes. Rotations across unequally scaled axes are rejected
before document commit and before a simulation tick commits. Prepared glTF node
matrices retain their own model hierarchy.

### Native 3D presentation subset

The native presentation contract admits the fields used by BLACKSITE. Select
its scene `environment` explicitly when using `light3d`, `decal3d`, `particles`,
`animator3d`, or primitive material and shadow fields. Its `postProcessing` must
include `enabled:true`, `toneMapping:"agx"`, and `antialias:"smaa"`. Exposure,
bloom threshold, softness, radius and intensity, and vignette intensity, radius
and softness use the shared TypeScript vocabulary. Other tone mapping and
antialias branches, and disabled post-processing, are rejected. Documents without
an environment keep the existing fixed shading path.

Environment fields include background, colored ambient light, height fog, solid
or procedural sky, and shadow settings. Procedural `sunEntityId` must identify a
directional light in that scene. HDR images, linear fog, and spot lights are not
admitted. A scene allows 32 directional and point lights combined, one
shadow-casting directional light, and four shadow-casting point lights. Shadow
maps are 512, 1024 or 2048 pixels, with two to four directional cascades when
configured.

Primitive visuals can add `material` with `color`, `metalness`, `roughness`,
`opacity`, `emissive`, `alphaMode`, and `alphaCutoff`. Use `alphaMode:"blend"`
for translucent surfaces. Both model and primitive visuals support `castShadow`
and `receiveShadow`. Prepared model materials preserve glTF base color,
metalness, roughness, normal-map scale and channel sampler settings, emissive
color, alpha mode and cutoff, and double-sided state. Their physical rendering
uses the explicit environment path. `animator3d` selects an `initialClip` from
`clips`, whose values are `clip:0`, `clip:1`, and so on, with `playbackRate` and
`loop`. Frames resolve the clip index and committed animation time.

The document can supply `presentation:{aspectRatio,hudWidth,hudHeight}` and
`ui:{safeArea,nodes}`. Native UI supports panel, text and bar nodes with the shared
parent, anchor, pivot, offset, visibility and opacity fields. Parents must be
preceding panels. Panels and bars require dimensions. `fontId` selects a verified
font asset. `ui` commands update text, bar values and visibility by node ID.
Other widget kinds and health-derived bar sources are rejected.

Native 3D particles use the shared emitter fields used by BLACKSITE: point,
sphere, cone or box shapes, local or world space, continuous rates and bursts,
lifetimes, initial speed, size and opacity curves, color gradients, gravity and drag.
Drawing supports billboards, stretched billboards, and world-aligned tetrahedron
meshes. Sprite sheets, child emitters, speed curves, circular and edge shapes,
velocity-aligned meshes and color ranges are rejected. `emitParticles` selects an
optional emitter and burst count. The portable native presentation helper
advances every committed tick and publishes at most 8192 resolved samples.
Same-session snapshots preserve particle state and UI overrides, including tick
rollback and replay.

At most 32 `decal3d` projectors use verified image assets and an explicit model
receiver or a receiver root containing model descendants. Their size, opacity
and render order follow the shared TypeScript fields. Prepared receiver geometry
must satisfy the decal helper's rigid and opaque restrictions. Native rendering
limits each projector to 200,000 eligible receiver triangles, summed across its
receiver geometry before broadphase filtering. Splitting the same geometry across
meshes or models leaves this count unchanged. This limit is stricter than the
legacy web engine's visited-triangle accounting. An over-budget projector is
dropped with a bounded, nonfatal per-decal diagnostic.

Native 2D uses `transform:{x,y,rotation,scaleX,scaleY}` in Y-up world units with
radians, plus the TypeScript component vocabulary `body2d`, `collider2d`, `sprite`,
`animator`, `tilemap`, `camera2d`, and `light2d`. Bodies are static or kinematic.
Colliders are axis-aligned with 32-bit category/mask filtering, sensors, and
one-way surfaces. Physics ancestors must remain fixed translations with zero
rotation and unit scale. Visual-only hierarchies can rotate and scale. A camera
entity's transform places its `camera2d`; document `camera2d` supplies the default.
Scene `gravity`, `lighting`, and `backgrounds` override document defaults.
`healthEntityId` chooses the HUD health entity.

Native 2D commands use `{x,y}` vectors. `move` rejects `jump`; check committed
`grounded` state and issue `setVelocity` for a jump. Use static-body velocity for
platform carry/push. `setPosition` teleports without carrying riders. `setVisual`
can select atlas frame, tint, opacity, flip, rotation, and positive visual scales
without changing collider transforms. Image assets support `sampling`, normalized
`pivot`, and `trim:{sourceWidth,sourceHeight,x,y}`. Animation samples committed
ticks. Audio `position:{x,y}` is explicit world-space placement. Native 2D rejects
3D vectors, quaternions, impulses, and capsule characters before execution.

A behavior refers to a script by `scriptId` and owns an explicit JSON state.
Hooks include start, scene enter, trigger/contact, event, fixed update, update,
and destruction. Each call runs in a fresh QuickJS realm. Persist data in returned
`state`, not globals or closures. Timers use tick numbers and named handlers.
There is no filesystem, networking, Qt object access, or asynchronous gameplay.

A minimal behavior source is:

```javascript
input => ({
  state: { ticks: (input.state.ticks || 0) + 1 },
  commands: [{ kind: "score", amount: 1 }]
})
```

The generated declarations returned by the native schema tools describe commands
and world queries. Commands are validated before commit. Movement affects the
current physics step. Query and contact results reach scripts on the next tick.
Scripts run in stable entity/behavior order at 60 Hz. A failed script batch rolls
back state, RNG, timers, commands, and presentation effects. Runtime inspection
and source replacement errors name the relevant source revision.

Use `native_cpp_game_get` entity/script views to inspect large documents. Use
native typed operations with `expected_revision` for edits. `setScript` validates
source before save. A valid simulation-affecting edit restarts the running state
from the authored document. Saved documents and short resource IDs are handled by
the authorized host. Native physics snapshots only restore inside their original
live session.


## Legacy web engine reference

The remaining sections describe the web engine, not `native-cpp-1`. Their schema
versions and command fields must not be copied into native C++ documents.

The fields and runtime rules behind `native-game`. Load `native-game` first for
the build, playtest and asset loop. The `edit_native_game` op description also
lists the op shapes for prefabs, the mixer, script params, input bindings, the
HUD tree, animation graphs, performance, spatial audio and collision layers.
Sections here say what the fields do and how they interact.

## Schema versions

New 2D games start at `schemaVersion: 4` with `engineVersion: "3"`. Older 2D
documents use schema 1 or 2 with engine `"1"`. Fonts, prepared assets, scene
music, lighting, backgrounds, gravity, `visualAnimation` and a render effect
chain need schema 2 or later. Tags, props and script params need schema 4.
Validation rejects these fields on an earlier schema. 2D `schemaVersion: 5` with
`engineVersion: "4"` is reserved for Rapier 2D physics, which this runtime does
not provide: validation and sessions refuse it with `engine_unavailable`. Do not
author schema 5. A schema must use its own engine version. 3D games use
`schemaVersion: 3` with `engineVersion: "2"`.

## Entity tags and properties

Both dimensions support optional `tags` and `props` on an entity. Use
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
and an error names the entity and tick. The props of each entity that runs a
script count once toward the 64 KiB script input limit. Other entities' props
travel with the world only when a script reads `input.world`. Runtime properties survive snapshot restore and
remain independent of the authored document and other prefab instances.
Mutating an input object does not change runtime state.

## 2D scripts

A `script` behavior is a function expression, or an object of lifecycle hooks
(see Lifecycle hooks and timers). A function receives `{tick, pressed,
justPressed, events, entity, world, state, random}` and returns `{state,
commands}`. `events` are the previous tick's events. `world` lists every active
entity with a collider or camera as `{id, source, x, y}`. `entity` holds the
caller's `id`, `source`, position, velocity, and `touching {down, up, left,
right}`, which names the sides of its collider that rest against a solid at the
start of the tick. A spawned instance has the id `<prefab>#<n>`, its `source`
is the prefab id, and it runs the prefab's script with its own state.

Functions, lifecycle hooks, and timer methods must be synchronous. Async functions
and generators fail preparation. Returning a promise, thenable, or iterator fails
the call. Use tick timers for delayed work.

Store persistent values in returned `state`. Nothing else carries over between
calls. A plain function expression such as `(input) => { … }` runs in strict
mode in a reused sandbox whose built-ins and global object are frozen, which
makes each call several times cheaper. Assigning to a global or a built-in
there throws, and the engine then repeats the call in a fresh context and keeps
that source in fresh contexts. Other sources, such as a function returned by an
initializer call, evaluate in a fresh context each call. Prefer plain function
expressions and keep helpers and temporary values in local variables.
Source initialization uses the seeded random generator. `maxTickMs` limits each
call, subject to the total script budget for the tick. Source and input/output
limits count UTF-8 bytes.

During a function call, global `world.get(id)` returns an entity or `undefined`,
and `world.query({source?, tag?, near?, radius?, limit?})` returns matching IDs
in runtime entity order. Both read the same immutable tick-start snapshot,
before movement behaviors or script commands run. Returned values are private
copies. Queries cover every active entity. Legacy `input.world` keeps its
existing shape and population, including only collider or camera entities in 2D.
The engine serializes `input.world` only when a script reads it, with a 1 MiB
limit, so prefer `world.get` and `world.query` with `near` and `radius`.
The 2D query record is `{id, source, x, y, velocityX, velocityY, grounded}`.
The 3D record is `{id, source, position, velocity, grounded}`, with XYZ vectors.
3D records and schema 4 2D records add `tags`, `props`, `rotation` and `active`.
A `tag` filter matches only entities that carry the tag, so it matches nothing
on schema 1 or 2. Pass `near: {x, y, z?}` and `radius` together. The radius is
nonnegative and includes entities on its boundary, measured between centers,
with omitted `z` treated as zero. `source` matches the record's original entity
ID, not a 3D prefab asset ID. `limit` is an integer from 0 to 1024, defaulting
to 1024. A call allows 64 combined `get`/`query` attempts. Exceeding the count
fails the call even if guest code catches it. Query arguments allow 4096 JSON
characters, `get` IDs 1024 characters, and responses 64 KiB. These APIs are
unavailable during source initialization.

The commands are `setVelocity`, `setPosition`, `setVisual {tint?, opacity?,
rotation?, scaleX?, scaleY?, flipX?}`, `playAnimation {clip}`, `spawn {prefabId,
x?, y?, velocityX?, velocityY?}`, `despawn`, `emit`, `sceneTransition`, and
`hud {id, text, x, y, size?, color?, align?}`. HUD coordinates are canvas
pixels. Empty text removes a label. A label with the id `score` or `win`
replaces the built-in label. Set `fontId` to a logical font binding for a HUD
label. Font assets use `mediaKind: "font"`, `fontFormat: "ttf" | "otf"`, and
`required: true` by default. Required fonts load before the first frame or fail
play and capture. An optional font (`required: false`) reports a fallback before
play. Export embeds the font bytes for offline use.

`log {message, level?}` writes a line to the editor console in 2D and 3D.
`level` is `"log"` (the default), `"warning"` or `"error"`. A log line never
changes the simulation, snapshots or replay, and it does not count toward
`maxCommands`. A tick keeps 32 lines and reports the rest as one dropped-lines
warning. Messages longer than 1000 characters are truncated. Log text still
counts toward the 64 KiB output limit of a script call. Lines logged before a
script failure appear in the console ahead of the error.

### Script time limits

`maxTickMs` accepts 1 through 20 ms, defaults to 8 ms, and cannot raise the
host's 20 ms ceiling. It counts the CPU time of the thread running the script, from just
before the call (or before compiling its source) until its output is checked.
Waiting for a processor does not count, and on Node neither do garbage collection
pauses during the call. A call ends only when both its CPU time
and its wall time reach the limit. Browsers have no thread CPU clock, so there
the limit counts wall time. The 50 ms script budget for a whole tick and the
100 ms limit for evaluating a source during preparation count wall time on
every host. A session's first scripted tick has 1,000 ms instead of 50 ms,
because it runs each script for the first time. A script that loops forever still ends at its limit.

What an overrun does depends on the host. The editor's play mode and the
standalone players skip the call: the entity keeps its script state, issues no
commands that tick, and the editor console shows a warning naming the call. A tick
past its 50 ms budget skips its remaining calls the same way. Headless runs,
replays, the CLI and agent playtests stop with a `Game script interrupted`
error, so a slow script fails verification. A skipped call depends on timing,
so a play session that skipped one may not replay identically.

### Script parameters

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

### Lifecycle hooks and timers

A script source may be an object of hooks instead of a function. It works in
2D and 3D with no schema change.

```js
({
  onStart(input) { every(30, "fire"); return { state: { shots: 0 } }; },
  fire(input) { return { state: { shots: input.state.shots + 1 },
    commands: [{ kind: "spawn", prefabId: "bolt" }] }; },
  onTriggerEnter(input, contact) { return { commands: [{ kind: "emit", event: "hit:" + contact.otherId }] }; },
  onDestroy(input) { return { commands: [{ kind: "emit", event: "gone" }] }; }
})
```

Hooks receive the same `input` as a function script and return
`{state?, commands?}` or nothing. Each hook sees the state returned by the
one before it. Within a tick they run in this order:

1. `onStart`, on the behavior's first call.
2. `onSceneEnter`, on the first tick of the scene.
3. `onTriggerEnter`, `onTriggerExit` and `onContact`, once per contact of
   the entity in the previous tick's events, in event order. A contact where
   either collider is a sensor is a trigger. Triggers fire on `enter` and
   `exit`. `onContact` receives every phase of a solid contact. The second
   argument is `{otherId, phase, sensor}`.
4. `onEvent`, once per trigger event of the previous tick that reaches the
   entity, in event order. See Typed events.
5. Due timers, in the order they were scheduled.
6. `onFixedUpdate` or `onUpdate`. They are aliases. Define one of them.

`onDestroy` runs alone in the tick after the entity despawns. It may return
only `hud`, `emit`, `spawn`, `despawn`, `sceneTransition`, `log`, `save` and `load` commands. A scene
transition in the legacy TypeScript runtime discards behavior state without calling
`onDestroy`. Native C++ scene transitions run outgoing `onDestroy` hooks before
committing the transition, preserving their behavior state during the hook. A
same-tick despawn and transition destroys each outgoing behavior once. Function
scripts run only as updates and are not called during native destruction. After a
successful native destruction, the behavior's state and timers are released.

`after(ticks, name)` calls the object's method `name` once, `ticks` ticks
later. `every(ticks, name)` calls it every `ticks` ticks. `ticks` is an
integer from 1 to 1000000, `name` must be a method that is not a hook, and a
behavior holds at most 32 timers. Scheduling an existing name replaces that
timer. Timers live in the behavior's snapshot state, so they replay from any
snapshot. Session preparation rejects an unknown `on*` key, a hook that is not
a function, and an object that defines both `onUpdate` and `onFixedUpdate`.
Lifecycle objects run in a fresh context each call.

### Typed events

`emit` takes an optional `payload` and `target` in 2D and 3D, with no schema
change. The payload is any JSON value up to 1 KiB serialized and 16 levels
deep. The target is `{entityId}` for one entity or `{tag}` for every entity
with that tag. Omit `target` to broadcast.

```js
// Sender
({ onTriggerEnter(input, contact) { return { commands: [{ kind: "emit", event: "alarm",
  payload: { by: contact.otherId, level: 2 }, target: { tag: "guard" } }] }; } })
// Receiver, on an entity tagged "guard"
({ onEvent(input, event) { if (event.event === "alarm") { return { state: { level: event.payload.level } }; } } })
```

The event lands in the stream as `{kind: "trigger", event, entityId,
payload?, target?}`, where `entityId` is the sender, and reaches scripts on
the next tick. `onEvent(input, event)` receives that object for each trigger
event that reaches its entity, broadcasts included, and the sender receives
its own broadcasts. Built-in `trigger` behaviors emit untargeted events, so
`onEvent` sees them too. The target also limits built-in listeners: a `spawn`
or `sceneTransition` behavior with `onEvent` and an `audioSource` with
`onEvent` react only to events that reach their entity. `input.events` still
holds every event of the previous tick, targeted or not. A tag target reaches
nothing on 2D schemas before 4. A plain `{kind: "emit", event}` produces the
same event as before. Payloads count toward the 64 KiB script input limit once
per tick.

### Player saves

Scripts save and load in 2D and 3D with two commands:

- `save {slot, data, scope?, snapshot?}` writes `data` to a slot after the tick.
- `load {slot, scope?}` reads a slot.

`scope` is `"progress"` (the default) or `"settings"`. The two scopes are
separate stores, so a progress slot and a settings slot can share a name and
removing one never touches the other. `snapshot: true` also stores the
end-of-tick session snapshot with a progress save. A settings save with a
snapshot fails the tick. The player keeps one snapshot save pending at a time,
and the editor stores the data without the snapshot.

The player runs saves and loads in order, with at most 8 waiting. A request
past that limit fails without stopping the game, and a failed load answers
with null data.

A slot name is 1 to 32 letters, digits, `_` or `-`. `data` must be a JSON
object of at most 16 KiB serialized, 256 keys counted at every depth and 16
levels deep. Each scope holds at most 16 slots per game. A tick accepts at most
4 save and load commands across all scripts, and more fail the tick. These
commands do not count toward `maxCommands` and never enter snapshots.

A load answers on a later tick through `input.loaded`, a list of `{scope, slot,
data}` where `data` is null for an empty slot. A frame carries at most 2
results. Keep what the game needs in script state:

```js
({ onStart() { return { commands: [{ kind: "load", slot: "main" }] }; },
  onUpdate(input) {
    const result = input.loaded?.find((entry) => entry.slot === "main");
    return { state: result ? { best: result.data?.best ?? 0 } : input.state };
  } })
```

The loaded data is part of the input frame, so a replay of recorded frames
reproduces it without storage. The standalone player stores saves in IndexedDB.
The editor stores them in localStorage under the game id. `nodetool game
simulate` and agent playtests keep them in memory. `simulate --saves <file>`
seeds slots from `{progress?, settings?}`, and its JSON report lists the slots
after the run.

## 2D visuals

For generated art in a workflow, pass one style entity with a reference image.
The guided graph sends that image through an image-to-image generation input
for every visual slot. `StageGameAssets.preparation` accepts per-slot alpha
trimming, target size with a crop policy, pivot, nearest or linear sampling,
and mirror tiling for single images. Trimming records crop offsets so placement
keeps its anchor. `StageGameAssets.fonts` stages TrueType or OpenType assets by
logical font ID.

1. Use `sprite.blend: "additive"` for light drawn on black, such as glows and
   sparks. Set `sampling: "linear"` on painted or soft assets.
2. Use `lifetime {ticks, fade, endScale}` for short-lived entities. A kinematic
   body without a collider moves but never collides, which keeps them cheap.
   Prefer the `particles` component for sparks, smoke and dust.
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

Set `scene.music` to an installed audio `assetId` for looping music. `volume`
ranges from `0` to `1`, and `fadeInTicks` and `fadeOutTicks` range from `0` to
`600`. Music starts at the scene's entry tick. Pause suspends audio, reset
restarts the entry scene once, and loading resumes the loop at the saved
logical tick. Set `music.streaming: {loopStartSeconds, loopEndSeconds?}` for
long tracks in 2D or 3D. This streams through the music bus without decoding
the whole asset. Start defaults to 0 seconds, end defaults to the track's end,
and an explicit end must exceed start. Both are bounded by 86400 seconds.
The intro plays once. Custom loop boundaries follow browser media events.
Existing fades crossfade outgoing and incoming scene tracks. Use `update_scene`
to replace the whole `music` object. Omit `streaming` to retain decoded
playback. Browser playback starts after a user gesture. A missing or
unplayable audio asset is reported in the player.

`visualAnimation` on a sprite animates `rotation`, `scaleX`, `scaleY`,
`opacity`, or `tint` from `from` to `to` over `durationTicks` in its `tracks`.
`delayTicks`, `repeat`, `pingPong`, and `easing` control timing. `rotationRate`
adds radians per tick for continuous spins and cannot share a rotation track.
Each property has at most one track. Tracks start at scene entry or spawn time.
The visual order is authored transform and sprite values, tracks, script
`setVisual`, then lifetime fade and scale. Tracks do not change collision.

Scene `backgrounds` define image layers independent of entities. Each layer
sets `assetId`, world-unit `width` and `height`, `origin` at the tile center,
`layer`, per-axis `parallax`, `scrollRate` in world units per second, and `mode`
(`none`, `repeat`, `repeatX`, or `mirror`). `repeatX` tiles only sideways, which
suits a strip of scenery. Parallax `0` stays fixed to the screen and `1`
stays fixed in the world. Optional `frame` selects an atlas rectangle.

Scene `lighting` holds an `ambient` color and intensity plus up to 32 `points`
with world position, color, intensity, radius, and falloff. Lighting multiplies
world color before effects. HUD stays unlit. Set `sprite.unlit: true` for
emissive art such as glows. Canvas2D capture paints these sprites above the lit
world. An entity `light2d {color, intensity, radius, falloff, offset?}` moves
with its entity. Each frame adds the entity lights nearest the camera to the
scene's fixed points, up to 32 lights in total.

`renderEffects` is an ordered chain of at most eight effects.
`brightnessContrast` uses `brightness` from `-1` to `1` and `contrast` from `0`
to `4`. `bloom` uses `threshold` from `0` to `1`, `softness` from `0` to `0.5`,
`radius` from `0` to `64` pixels, and `intensity` from `0` to `4`. `lut` refers
to an opaque packed 2D cube image with dimensions `size² × size` and an
optional intensity and color domain. Effects run in listed order. Set
`hudEffectOrder` to `afterEffects` to keep text crisp, or `beforeEffects` to
process HUD with the world. A bloom chain defaults to `afterEffects`.
`required: true` makes unsupported GPU effects fail before play or capture.
Optional effects are omitted with a diagnostic on Canvas 2D.

Collider `category` and `mask` are unsigned 32-bit bitsets in 2D. They default
to `1` and `4294967295`. A pair interacts only when each mask includes a
category bit from the other collider. Give bullets masks that exclude other
bullets when bullet-to-bullet interaction is unnecessary.

Contacts report `phase: "enter" | "stay" | "exit"` and `normalX`/`normalY`.
Check both `entityId` and `otherId`, since each pair emits one contact per tick.
Built-in triggers fire on entry. Use `stay` contacts for repeated overlap logic.
Swept collisions detect fast movement through thin static walls and sensors.
Scene entry starts authored entities' animation and lifetime clocks, and saves
preserve those clocks and active contact pairs.

## Particles

The particle inspector offers Fire, Smoke, Sparks, Dust, Magic, Rain, Snow and
Explosion presets in both dimensions. Applying one replaces that entity's
`particles` component and preserves its other components. Select an emitter
to edit its fields, lifetime curves and color gradient. Renaming an emitter
repairs its death-emitter references. Removing one removes references to it.
The isolated preview uses a fixed seed and restarts when edited. Pause and
Restart affect the preview only. The 2D preview uses Canvas2D, including sprite
sheets and blending. The 3D preview uses WebGL2, including stretched and mesh
particles and depth softness. It does not run gameplay scripts or change the
play session.

Agents and CLI document edits use the same `update_entity` operation as the
inspector. Set the complete component with
`{op: "update_entity", entity_id: "effect", set: {particles: {emitters: [...]}}}`.
There is no preset-name operation. Node.js authoring can also import
`getGameParticlePreset(name, dimension)` from `@nodetool-ai/protocol` to get
fresh canonical data. In a code action, use the JSON recipes below with the
existing game edit API instead of importing that host package.

### Particle preset recipes

Each payload is a complete `particles` component. Omitted fields take schema
defaults. These canonical recipes use 3D draw settings. For a 2D entity, remove
`render` from each emitter and set `shape.size.z` to `0` for box shapes.
Keep other values unchanged. Both dimensions use world units and +Y upward.
Place rain and snow emitters above the area they cover. Explosion is a finite
burst, which can be restarted with `emitParticles` without a count.

#### fire

```json
{"emitters":[{"id":"flame","rate":48,"shape":{"kind":"cone","angle":15,"radius":0.15},"lifetime":{"min":0.6,"max":1.2},"speed":{"min":1.2,"max":2.2},"size":{"min":0.15,"max":0.4},"color":"#ff932d","sizeOverLifetime":[{"t":0,"value":0.5},{"t":0.3,"value":1},{"t":1,"value":0.1}],"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"colorOverLifetime":[{"t":0,"color":"#fff4a0"},{"t":0.5,"color":"#ff8326"},{"t":1,"color":"#a91c14"}],"gravity":{"x":0,"y":1.4,"z":0},"blend":"additive","unlit":true}]}
```

#### smoke

```json
{"emitters":[{"id":"smoke","rate":14,"shape":{"kind":"cone","angle":20,"radius":0.2},"lifetime":{"min":2,"max":3.5},"speed":{"min":0.3,"max":0.7},"size":{"min":0.3,"max":0.6},"color":"#9d9fa8","opacity":0.45,"sizeOverLifetime":[{"t":0,"value":0.4},{"t":1,"value":2.5}],"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"colorOverLifetime":[{"t":0,"color":"#52545e"},{"t":1,"color":"#b9bac2"}],"gravity":{"x":0.08,"y":0.35,"z":0},"drag":0.3,"unlit":true}]}
```

#### sparks

```json
{"emitters":[{"id":"sparks","rate":24,"shape":{"kind":"sphere","radius":0.05,"fromSurface":false},"lifetime":{"min":0.3,"max":0.9},"speed":{"min":2,"max":5},"size":{"min":0.025,"max":0.06},"color":"#ffd37c","opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"colorOverLifetime":[{"t":0,"color":"#fff4c1"},{"t":1,"color":"#e7551d"}],"gravity":{"x":0,"y":-4,"z":0},"blend":"additive","unlit":true,"render":{"kind":"stretched","length":2,"speedScale":0.04}}]}
```

#### dust

```json
{"emitters":[{"id":"dust","rate":8,"shape":{"kind":"box","size":{"x":4,"y":2,"z":2}},"lifetime":{"min":3,"max":6},"speed":{"min":0.02,"max":0.08},"size":{"min":0.02,"max":0.05},"color":"#d4c4a0","opacity":0.45,"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"gravity":{"x":0.01,"y":0.01,"z":0},"unlit":true}]}
```

#### magic

```json
{"emitters":[{"id":"magic","rate":30,"shape":{"kind":"sphere","radius":0.7,"fromSurface":true},"lifetime":{"min":0.8,"max":1.8},"speed":{"min":0.1,"max":0.5},"size":{"min":0.04,"max":0.12},"angularVelocity":{"min":-3.141592653589793,"max":3.141592653589793},"color":"#9d79ff","sizeOverLifetime":[{"t":0,"value":0},{"t":0.3,"value":1.5},{"t":1,"value":0}],"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"colorOverLifetime":[{"t":0,"color":"#63f4ff"},{"t":0.5,"color":"#9970ff"},{"t":1,"color":"#fa91e6"}],"blend":"additive","unlit":true}]}
```

#### rain

```json
{"emitters":[{"id":"rain","rate":120,"maxParticles":512,"shape":{"kind":"box","size":{"x":6,"y":0.2,"z":3}},"lifetime":{"min":0.7,"max":1.1},"speed":0,"size":0.025,"color":"#a2c9e8","opacity":0.65,"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"gravity":{"x":0.4,"y":-18,"z":0},"unlit":true,"render":{"kind":"stretched","length":2,"speedScale":0.06}}]}
```

#### snow

```json
{"emitters":[{"id":"snow","rate":28,"shape":{"kind":"box","size":{"x":6,"y":0.2,"z":3}},"lifetime":{"min":4,"max":6},"speed":0,"size":{"min":0.04,"max":0.1},"angularVelocity":{"min":-0.7853981633974483,"max":0.7853981633974483},"color":"#e8f5ff","opacity":0.9,"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"gravity":{"x":0.025,"y":-0.25,"z":0},"unlit":true}]}
```

#### explosion

```json
{"emitters":[{"id":"explosion","duration":0.1,"loop":false,"rate":0,"bursts":[{"time":0,"count":96,"cycles":1,"interval":0.1}],"shape":{"kind":"sphere","radius":0.1,"fromSurface":false},"lifetime":{"min":0.4,"max":1},"speed":{"min":2,"max":6},"size":{"min":0.1,"max":0.3},"color":"#ff9b30","sizeOverLifetime":[{"t":0,"value":1.5},{"t":1,"value":0}],"opacityOverLifetime":[{"t":0,"value":0},{"t":0.12,"value":1},{"t":1,"value":0}],"colorOverLifetime":[{"t":0,"color":"#fff6c5"},{"t":0.4,"color":"#ff992c"},{"t":1,"color":"#b62c19"}],"drag":2,"blend":"additive","unlit":true}]}
```

### Particle component fields

Add particle effects with the `particles` component on any 2D (schema 2 or
later) or 3D entity. It holds up to 8 `emitters`, each with a unique `id`. An
emitter sets `rate` (particles per second), `bursts` (`time`, `count`,
`cycles`, `interval`), `duration`, `loop`, `playOnStart`, `maxParticles` and a
`shape`: `point`, `circle`, `sphere`, `cone`, `box` or `edge`. Cone, box and
edge emit along local +Y. Point, circle and sphere emit outward. Per-particle
values `lifetime`, `speed`, `size`, `rotation` and `angularVelocity` take a
number or `{ min, max }`. `color` takes `#rrggbb` or `{ min, max }`. The
`sizeOverLifetime`, `speedOverLifetime` and `opacityOverLifetime` curves are
lists of `{ t, value }` keys sorted by `t` from 0 to 1. `colorOverLifetime` uses
`{ t, color }` keys. Add `gravity` (`{ x, y, z }` in units per second squared)
and `drag`. `space: "local"` makes particles follow the entity.
`onDeath: [{ emitter, count }]` fires another emitter of the same component
where each particle dies. Give that emitter `playOnStart: false` and `rate: 0`.

Scripts trigger emitters with `{ kind: "emitParticles", emitter?, count? }` on
their own entity. Without `count`, the emitter restarts its cycle, which suits
a one-shot explosion with `loop: false`. With `count`, that many particles
spawn at once. Omitting `emitter` selects the first emitter in the list. The
command is presentation only and never appears in gameplay events or
snapshots. Particles cannot affect scores, physics or scripts. Prefer them over
spawned prefabs for sparks, smoke and dust.

Each emitter also sets how its particles draw in 2D. Without `sprite`, a
particle is a soft round dot tinted by its colour. `sprite: { assetId, columns,
rows, frameCount?, cycles?, sampling? }` uses an image asset instead. A sheet is
cut into `columns` by `rows` cells read left to right and top to bottom, and the
first `frameCount` cells play `cycles` times over each particle's life.
`sampling` defaults to `nearest`. `blend: "additive"` adds light, which suits
fire, sparks and magic. The default `normal` alpha-blends, which suits smoke and
dust. Particles take scene lighting like sprites. Set `unlit: true` so glowing
particles keep their colour in the dark. `layer` sets the draw layer. It
defaults to the entity's sprite layer, or 0 without a sprite, and particles
draw above sprites of the same layer. `size` is the particle's width in world
units. `rotation` and `angularVelocity` are radians and radians per second.

The standalone player, the editor's play view and `capture_native_game_frame`
draw 2D particles. A capture simulates particles for every tick up to the
captured one, so a burst at tick 0 is still visible a few ticks later. WebGPU
draws every live particle. The Canvas2D fallback draws at most 1024 visible
particles. Each emitter's random stream is seeded from its entity and emitter
ids, so captures repeat.

In 3D, `render` sets how each particle draws. The default `{ kind:
"billboard" }` is a soft round dot facing the camera, `size` units across and
turned by `rotation`. `{ kind: "stretched", length?, speedScale? }` lies along
the particle's direction of travel on screen. It is `size` wide and `size ×
length + speed × speedScale` long, which suits sparks, rain and streaks.
`length` defaults to 1 and `speedScale` to 0.1 seconds. `{ kind: "mesh",
shape, align? }` draws a small solid `box`, `sphere`, `tetrahedron` or
`octahedron`, `size` units across, for debris and confetti. With `align:
"world"`, the default, it turns by `rotation` about world +Y. With `align:
"velocity"` its +Y points along its velocity. Mesh particles take scene
lighting unless `unlit: true`. Billboards always keep their own colour. Both
take scene fog and post-processing such as bloom, so additive particles glow.
`softness` (world units) fades a billboard out where it nears the geometry
behind it, so smoke and glows do not cut a hard line through the floor. The
renderer then draws the scene's depth once more per frame, so set it only on
emitters that touch geometry. That depth pass skips transparent materials,
keeps alpha-tested cut-outs, and counts toward the draw call and
triangle budgets. 3D particles ignore `sprite` and `layer`, and
2D particles ignore `render` and `softness`. Validation warns about `render` or
`softness` on a 2D emitter, `softness` on a mesh emitter, and `sprite` on a
3D emitter, without failing. Editor Play, the 3D standalone player,
`nodetool game capture` and `capture_native_game_frame` draw 3D particles.
Translucent particles sort across render types without writing depth. Interleaved
types can increase draw calls. A scene transition clears the particle field.
Within a scene, detached world particles retain world-space death chains until
they finish. Storage grows lazily within the scene particle limit.

## 3D collision layers

`collisionLayers` names up to 16 layers, and the layer at index `i` owns bit
`i`. `collisionMatrix` lists the layer pairs that do not collide, in either
order. A layer paired with itself stops its colliders from touching each other.
Every unlisted pair collides. Set both with `set_game {collision_layers,
collision_matrix}`, and put a collider on a layer with `update_entity set
collider3d {layer}`. A layered collider derives `category` from its bit and
`mask` from the matrix, so leave its raw bits at `1` and `65535`. Validation
rejects an unknown layer name, a pair listed twice in the matrix and
conflicting layer bits. Raw `category` and `mask` remain an override for
colliders without a layer. A collider without a layer keeps the default
category `1`, which is the bit of `collisionLayers[0]`. It therefore shares the
first layer's pairs: a layer paired with `collisionLayers[0]` does not touch
unlayered colliders either. Name the first layer for the world, or give such
colliders a layer. 2D colliders keep raw bits only.

## 3D physics materials

`physicsMaterials` names up to 64 surfaces that colliders share. Each material
has `friction` (0 to 4, default 0.5), `restitution` (0 to 1, default 0),
`frictionCombine` and `restitutionCombine`. A combine rule is `average`
(default), `min`, `multiply` or `max`. When two touching colliders use
different rules, the later rule in that list wins. Use `max` restitution for a
bouncy ball and `min` friction for ice. Declare materials with `set_game
{physics_materials: {name: material}}`, and remove them all with
`physics_materials: null`. Point a collider at one with `update_entity set
collider3d {physicsMaterial: name}` and clear it with `physicsMaterial: null`.
A collider with a material takes all four values from it, so leave its inline
`friction` at 0.5 and `restitution` at 0 and set no inline combine rule.
Validation rejects an unknown material name and conflicting inline values. A
collider without a material keeps its inline values and may set
`frictionCombine` and `restitutionCombine` itself. Existing documents name no
material and simulate as before. 2D colliders have no friction or
restitution.

## Audio mix and spatial audio

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
the scene's snapshot without a fade. The mix is presentation state. It is not
saved in game snapshots and never changes playtest results or replay.

Set `audioSource.spatial: true` to play an entity's effect at its position in
2D and 3D. The listener is the active camera, so an emitter right of the camera
plays in the right ear. Effects play at full volume within `minDistance`
(default 1 world unit) and fall off by `distanceModel` (`linear`, `inverse`
by default, or `exponential`) and `rolloff` (default 1) out to `maxDistance`
(default 50), which must exceed `minDistance`. The `linear` model clamps
`rolloff` to 1 and is silent at `maxDistance`. A 3D `cone {innerAngle,
outerAngle, outerGain}` points along the entity's -Z axis. 2D emitters ignore
the cone. `doppler` (default 0, 1 is physical) shifts pitch with emitter and
camera motion. Set a field to `null` in `update_entity` to return it to its
default. The event that starts the effect carries the emitter position, so a
collectible that despawns as it plays still sounds where it was. Spatial
settings never change simulation.

## 3D animation graphs

A 3D animation graph lives in the document's `animationGraphs` map. An
entity's `animator3d.graph` names one, and its `animator3d.clips` maps the
graph's clip aliases to prepared clip IDs, so one graph can drive several rigs.
Store a graph with `set_animation_graph {graph_id, graph}` and delete it with
`remove_animation_graph {graph_id}`. An animator with a graph cannot also set
`initialClip`.

A graph declares `parameters` (`float` with a default, `bool` with a default,
or `trigger`) and one to eight `layers`. Each layer has an `initialState`,
`states` and `transitions`. A state plays a `motion`: one `clip`, a `blend1d`
over a float parameter with points in increasing `value` order, or a `blend2d`
over two float parameters. `speed` scales the animator's `playbackRate`, and
`loop` defaults to true. The first layer is the unmasked override base. Later
layers can be `additive` and can set `weight` and a `mask` of prepared model
node IDs. A mask covers each listed node and its descendants.

A transition names `from` (a state ID, or `*` for any state), `to`,
`conditions`, optional `exitTicks` and `durationTicks` for the crossfade. Every
condition must hold. Float conditions use `gt`, `gte`, `lt`, `lte`, `eq` or
`neq` with a `value`. Bool conditions use `true` or `false`. A trigger uses
`set` and resets once a transition consumes it. `exitTicks` is how long the
source state must run before the transition may fire. Each transition needs a
condition or `exitTicks`. A crossfading layer does not start another
transition. Transitions are checked in document order.

Scripts set parameters with `setAnimParam {name, value}`. Pass `true` to fire
a trigger. `playAnimation {clip}` on a graph entity switches the base layer
directly to the state with that ID, or else to the first state that plays that
clip alias, using `animator3d.transitionTicks`. Example locomotion: a `speed`
float, a `move` state with `blend1d` points idle at 0, walk at 2 and run at 6,
and a script that sends `setAnimParam` with the character's planar speed.

Graph state (current state, entry tick, crossfade source and parameter values)
is simulation state, saved in snapshots. Check it with a playtest that sets
`restore_at_tick` and asserts `replay_matches`. The renderer samples the
resolved pose at the interpolated tick. Blended clips share one normalized
phase. The pose sampler blends node translation, rotation and scale. It does
not blend morph targets.

Model preparation derives `clipDurations` from verified GLB time accessors.
Bindings with this metadata retain a normalized simulation phase when blend
parameters change, including across save and restore. Do not invent or edit
durations. For a legacy binding without them, regenerate a model candidate from
its existing source with `generate_game_asset`, then explicitly install it with
`install_native_game_asset`. Installation rederives the durations from its bytes.
Until then, blends keep legacy elapsed-time sampling and validation reports
`legacy_animation_phase`.

## 3D rendering

Set every `environment` field with `update_scene`. It replaces the whole
`environment`, so send the existing `background`, `ambient`, `fog`, `shadows`,
`sky` and `postProcessing` with the changed field. Capture the scene and view
the frames to review a change.

`environment.fog` accepts either linear `{ color, near, far }` or height
`{ kind: "height", color, density, baseHeight, heightFalloff, maxOpacity }`.
Height fog replaces linear fog and integrates exponential density along the
camera ray. `density` (0.000001 to 10, default 0.02) is extinction per world
unit at `baseHeight` (-10000 to 10000, default 0). `heightFalloff` (0.000001
to 100, default 0.2) reduces density above that height. `maxOpacity` (0 to 1,
default 1) limits coverage. Omit `fog` to disable it. Both camera projections,
rigid and animated models, and 3D particles receive scene fog.

Add an image projection with `decal3d: { assetId, receiverId, size: { x, y, z },
opacity, renderOrder }`. `assetId` names a verified PNG, JPEG or WebP image
slot. Browse a staged image with `browse_native_game_assets`, then use its
binding with `install_native_game_asset`. `receiverId` names one existing
non-template primitive or rigid model entity in the same scene. Use a separate
projector entity whose `transform3d` positions and rotates the projection box.
Its scale multiplies `size`. Parent the projector to the receiver to keep the
decal attached as it moves. Otherwise the projection volume stays in world
space. Each size axis is 0.001 to 1000 world units,
`opacity` is 0 to 1 (default 1), and integer `renderOrder` is 0 to 31 (default
0). Higher order draws later. Ties follow entity order.

A scene accepts at most 32 authored decals. Projection follows moving rigid
receivers and selected visible model nodes, respects foreground depth, and
supports image transparency. Skinned, morphed or instanced receivers, and
transparent or alpha-masked receiver materials, report a diagnostic instead of
projecting. A receiver with `animator3d` is invalid. Projection also reports a
diagnostic when its bounded node, triangle or output work exceeds the renderer
limit. Decals affect presentation only and never add collision surfaces.

`environment.shadows` is `{ enabled, mapSize, extent, cascades? }`. Without
`cascades`, the one shadow-casting directional light draws a single map that
covers `extent` meters around the light. For scenes deeper than about 30 m, add
`cascades: { count, split, maxDistance }`. It splits the camera view into
`count` maps (2 to 4, default 3) up to `maxDistance` meters (default 200), so
near shadows stay sharp and far shadows stay continuous. `split` (0 to 1,
default 0.5) gives nearby cascades more resolution as it rises. `extent` is
ignored while cascades are on. Only one directional light can cast shadows.

Every mesh with `castShadow` (true by default on primitives and models) draws
again into each cascade it reaches. The nearest cascade re-renders every frame,
the second every other frame, and the rest every fourth frame or when the view
moves past their drift limit. Use 2 or 3 cascades, set `maxDistance` to how far
the player can judge a shadow, and set `castShadow: false` on terrain and
ground, which still receive shadows. Validation warns with
`large_shadow_caster` when a casting mesh 100 units or wider sits in a scene
with cascades. Each 2048 map holds 16 MiB of depth.

Point and spot lights cast shadows when their `light3d.castShadow` is `true`.
At most 4 of them may cast per scene. Validation rejects a fifth. If spawned
prefabs push a frame over the budget, the extra lights render unshadowed and
the capture stats report one diagnostic. Each local shadow re-renders the scene
(six times for a point light), so enable it only on lights that need it.
Every light accepts `shadowBias` (-0.01 to 0.01) and `shadowNormalBias` (0 to
1), both default 0. Raise `shadowNormalBias` to about 0.02 to 0.05, or set
`shadowBias` to about -0.0005, when lit surfaces show striped shadow acne. Too
much bias detaches shadows from their casters. Set lights with `update_entity`.

`environment.sky` sets the background and image-based lighting. Omit it, or use
`{ kind: "color" }`, for the solid `background` color without environment
lighting. `{ kind: "procedural", sunEntityId?, turbidity, rayleigh,
groundColor, intensity }` renders a physical sky. Its sun follows
`sunEntityId`, which must name a directional light in the same scene. Without
it, the sun follows the scene's first directional light. Rotate that light to
move the sun. `turbidity` (1 to 20, default 10) adds haze. `rayleigh` (0 to 4,
default 2) deepens blue and sunset tones. `groundColor` fills the lower
hemisphere. `intensity` (0 to 8, default 1) scales both the sky background and
its reflections. Each change of sun direction re-renders the sky cube and its
environment map, so a sun that turns every tick rebuilds them every tick. Keep
the sun still, or turn it in rare steps. Metal and glossy materials reflect the sky. Ambient light
still adds on top, so lower `ambient.intensity` when the sky lights the scene.
HDRI skies are not available yet: an HDRI asset cannot be installed.

`environment.postProcessing` grades the rendered image. It is presentation only
and never changes simulation or snapshots. `enabled: false` keeps the settings
and renders as if they were absent. The fields are:

- `exposure` (1/32 to 16, default 1) multiplies scene light before tone mapping.
- `toneMapping` is `aces` (default), `agx`, `neutral` or `linear`. AgX keeps
  saturated highlights from turning white. Neutral keeps base colors closest to
  their authored values. Linear scales by exposure and clips.
- `bloom` `{ threshold, softness, radius, intensity }` adds glow around light
  above `threshold` (0 to 8, default 0.85). Emissive materials and bright
  highlights bloom. `softness` (0 to 0.5) widens the threshold transition.
  `radius` (0 to 1) spreads the glow, and `intensity` (0 to 4) sets its strength.
- `vignette` `{ intensity, radius, softness }` darkens the corners. `intensity`
  (0 to 1) of 1 reaches black. Darkening starts at `radius` (0 at the center,
  1 at the corner) and reaches full strength over `softness`.
- `antialias` is `msaa` (default), `fxaa`, `smaa` or `none`. `smaa` gives the
  cleanest edges after the other effects. `fxaa` is cheaper and softer.

The passes run in this order: bloom, exposure and tone mapping, vignette,
antialiasing. Exposure and tone mapping alone cost nothing extra. Bloom,
vignette, or an `antialias` other than `msaa` renders through extra full-screen
passes, and the background color then passes through tone mapping too. Bloom
adds a bright pass and a chain of five blur levels, the costliest effect. SSAO,
depth of field, LUT grading and chromatic aberration are not available in 3D.

## Input bindings

Action and axis names come from `inputActions` and `inputAxes`. The optional
document-level `inputBindings` maps each name to physical controls. Set it with
`set_game {input_bindings}`, or pass `input_bindings: null` to return to the
defaults. The op replaces the whole map:

- `actions`: `{ action: [binding] }`. A binding is `{kind: "key", code}` with a
  `KeyboardEvent.code` such as `KeyJ`, `{kind: "keyValue", key}` with a
  `KeyboardEvent.key` such as `z` or `+` (letter case is ignored, and a key
  that a `key` binding names by code does not also match),
  `{kind: "mouseButton", button}`, `{kind: "gamepadButton", button}` in the
  standard gamepad layout, `{kind: "gamepadAxis", axis, direction:
  "negative"|"positive", threshold?}`, `{kind: "touchButton", label?}` or
  `{kind: "touchStick", direction}`.
- `axes` (3D only): `{ axis: [binding] }` with `{kind: "keys", negative, positive}`
  code lists, `{kind: "gamepadAxis", axis, deadZone?, invert?}`,
  `{kind: "gamepadButtons", negative, positive}` or
  `{kind: "touchStick", axis: "x"|"y", invert?}`. The binding with the largest
  magnitude sets the value.
- `look` (3D only): a list of `{kind: "mouse", sensitivity?, invertY?}`,
  `{kind: "gamepadStick", xAxis?, yAxis?, deadZone?, speed?, invertY?}` and
  `{kind: "touchDrag", sensitivity?, invertY?}`.

A listed action or axis uses exactly the listed bindings, and an empty list
unbinds it. An unlisted one keeps the defaults generated from its name. In 2D,
arrows and WASD are `left`/`right`/`up`/`down` and Space is `space`, by key
position. Any other action is a `keyValue` binding of its name, so it follows
the player's keyboard layout. In 3D, `fire` is the left mouse button and F,
`jump` is Space, `respawn` is R, and `moveX`/`moveZ` read WASD and arrows.
Defaults add the gamepad d-pad and left stick for directions and movement,
button 0 for `jump`/`space`, the right trigger for `fire`, the right stick for
look, and touch buttons for every other action. Binding an undeclared action or
axis is a validation error.

Bindings only turn physical input into input frames. They never enter the
simulation, so playtests, replays and snapshots use the same `pressed`,
`justPressed`, `axes` and `look` frames. Gamepads are polled once per tick. The
3D players request mouse capture on click only when mouse look is bound.
Mouse actions work on the acquisition click and when capture is unavailable or
rejected. Explicit `look: []` disables capture. HUD buttons own their presses
before gameplay mouse or touch controls, and letterbox bars do not hit the HUD.
On a touch screen, editor play, public players and both standalone players
show a stick when an action or axis has a touch stick
binding and one button per action with a touch button binding. The 3D player
also turns the camera by dragging on the right half. Input pressed while play
is paused is dropped. Player-facing rebinding is not stored yet.

## HUD widget tree

`ui` on the document holds HUD widgets drawn in every scene. `ui` on a scene
holds widgets drawn above them in that scene. Set either with
`set_ui {scene_id?, ui}`, or `ui: null` to remove it. The op replaces the whole
tree: `{safeArea?, focusNavigation?, nodes: [node]}`. 2D and 3D documents
take the same tree and draw it with the same layout.

Every node has `kind`, `id`, and optionally `parent`, `anchor`, `pivot`,
`offset`, `width`, `height`, `visible` and `opacity`. `anchor` is a point
`{x, y}` in 0..1 of the parent's rectangle, or of the HUD rectangle for a root
node, so `{x: 1, y: 0}` is the top-right corner. `pivot` is the node's own point
placed there and defaults to `anchor`. `offset` moves the node in HUD pixels.
The 2D HUD rectangle is the camera view at `pixelsPerUnit` pixels per unit, so
a 16 by 9 camera at 32 pixels per unit gives 512 by 288. The 3D HUD rectangle
is `presentation.hudWidth` by `hudHeight`, stretched over the viewport. The
exported 3D player also renders the scene at `hudWidth` by
`hudWidth / aspectRatio`, so `hudWidth` sets the render resolution and the cost
of every full-screen pass. A HUD value that changes repaints the whole HUD and
uploads it as a texture. With
`safeArea` (default true) root anchors stay inside the device's safe-area
insets.

- `panel {color?, cornerRadius?}` fills its rectangle and holds children placed
  by their anchors.
- `image {assetId}` draws an image asset. 3D documents bind no images, so a 3D
  image node fails validation.
- `text {text, size?, color?, align?, fontId?}` sizes itself from its text
  unless it has a width.
- `bar {source?, value?, max?, color?, background?, direction?}` fills
  `value / max` (max defaults to 1). `source: {kind: "health", entityId}` reads
  the entity's health and its health behavior's maximum.
- `button {action, text?, background?, size?, color?, fontId?}` presses a
  declared input action while a mouse button or a finger holds it.
- `stack {direction?, gap?, padding?, align?}` lays children in a column or a
  row and sizes itself from them.
- `grid {columns, gap?, padding?}` lays children in cells as large as the
  largest child.

A child must come after its parent, and only panels, stacks and grids hold
children. Panels, images, bars and buttons need `width` and `height`. Ids are
unique across the document tree and each scene tree.

Scripts change nodes with `{kind: "ui", id, text?, value?, max?, visible?}`.
`text` applies to text and buttons, `value` and `max` to bars, and `visible`
to any node. A change lasts until the scene changes and is saved in snapshots.
A command for a missing node, or a field the node does not have, fails the
step. An `onDestroy` hook may return `ui` commands.

A button press reaches scripts as its action in `pressed` and `justPressed`,
exactly like a key, so replays and snapshots need nothing extra. In 3D a click
on a button reaches the HUD only while the mouse is not captured. With
`focusNavigation: true`, the gamepad D-pad moves focus between visible buttons
and button 0 presses the focused one. While the tree shows a button, those
gamepad buttons drive the HUD instead of the game's bindings. Existing `hud`
labels still draw, above the tree.

## Distance culling and frame budgets (3D)

Both are presentation only. They never change simulation, snapshots or replay.

- `set_performance {performance}` replaces document `performance`. `null`
  removes it. `cullLayers` maps a layer name to `{maxDistance}` (at most 32
  layers). `budgets` sets `drawCalls`, `triangles`, `particles` and `voices`,
  and the time budgets `tickMs` (tick p95, default 4) and `frameMs` (frame p95,
  default 16.6).
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
  browser console once each time a budget is exceeded. The standalone players
  and 3D capture count live particles. The 2D player uses the default particle
  budget because 2D documents have no `performance`.
- `nodetool game bench`, `nodetool game capture` and `nodetool game perf` check
  these budgets and exit 1 on an overrun with `--fail-on-budget`. Load
  `native-game-performance` for the targets, the budgets per game type and the
  measure-fix loop.

## Editor panels the user can open

Point the user to these when they work in the game editor alongside you.

- **Run 10 s** diagnoses the draft in an independent session and reports the
  first failing tick and script time by entity. **Replay to tick** rewinds the
  active play session after a script error. **Ask the assistant** passes the
  script context to the game assistant.
- Editing an existing script source during play recompiles it without resetting
  the tick or script state. A compilation failure keeps the previous source.
  Changing script form between a function and lifecycle object requires
  **Restart from tick 0**. Other draft changes also require a restart.
- The **Console** panel lists play-session errors, script errors with their
  tick, reload compilation errors, script log lines, **Run 10 s** failures and
  validation errors.
- The **Assets** panel shows the `browse_native_game_assets` catalog with
  thumbnails. **Generate** and **Regenerate** run `generate_game_asset` for
  image, speech and music slots. **Use** binds an older candidate and moves the
  slot's frame and tile bindings onto it.
- Ctrl+K (Cmd+K on macOS) opens the command palette, where **Edit keyboard
  shortcuts** rebinds editor shortcuts.
- When the script pane reports a draft conflict, local typing stays unsaved
  until the user picks **Keep my version** or **Use draft version**.
- Restoring a revision asks for confirmation because it replaces the draft and
  clears its undo history. The newest 100 published revisions are retained.


## 3D forces and torques

Return `{kind: "addForce", force: {x, y, z}}` to accelerate the issuing
entity's dynamic body, `{kind: "addTorque", torque: {x, y, z}}` to turn it,
or `{kind: "addForceAtPoint", force: {x, y, z}, point: {x, y, z}}` to apply
a force at a world-space point. An offset point also produces torque. All
vectors use world space, even when the body is rotated. Each component must
be finite and between -1000000 and 1000000.

Loads accumulate within the current simulation tick and clear after its
physics step. Return the commands on subsequent ticks to keep applying them.
Use `impulse` for an immediate velocity change. Forces require the issuing
entity's active dynamic body. Static, kinematic, missing and inactive bodies
reject them. A nonzero load wakes the body, while a zero load keeps a sleeping
body asleep. These commands are available only in 3D scripts.

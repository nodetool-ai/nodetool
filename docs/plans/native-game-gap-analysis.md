# Game engine and editor gap analysis

Scope: the native game engine (`packages/game-runtime`, `packages/game-renderer`, `packages/protocol/src/game*.ts`) and the 2D and 3D editors (`web/src/components/game/`), compared with Unity 6 and Unreal Engine 5. Code was read on `main` at `b1337258` (2026-10-06), which includes the Unity-style layout from PR #6038.

This file does not repeat the bugs in [the audit](native-game-editor-audit.md) (F1 to F30). Gaps here are labelled G1 onwards.

## How to read the priorities

NodeTool games are authored by people and agents together, built from generated assets, and shipped to the browser. That shapes the ranking:

- **P0** blocks the stated goal (state-of-the-art graphics, physics, audio, professional UX) or blocks generated content from working well.
- **P1** is expected by anyone who has used Unity or Unreal and is achievable in a browser engine.
- **P2** is useful polish or depth.

Each gap says what exists today, what is missing, and why it matters for NodeTool.

## Deliberately out of scope

These are core to Unity and Unreal but do not fit a browser-delivered, agent-authored engine. They are left out on purpose.

- Console, mobile-native and VR/XR platform targets and their certification tooling.
- Nanite-style virtualized geometry, Lumen-class dynamic GI and hardware ray tracing. WebGPU has no ray-tracing extension, and the budget cost is wrong for the web.
- World Partition and open-world streaming at the scale of tens of kilometres.
- Blueprint-style visual scripting. NodeTool's agent writes scripts, and the workflow graph already covers visual authoring. A second visual language would split authoring.
- C++ or C# native scripting, hot-reloadable native modules and plugin SDKs.
- Dedicated-server multiplayer, replication graphs and matchmaking. Deterministic lockstep or rollback is mentioned once under G44 because the engine is already deterministic.
- Terrain sculpting with height-map painting tools, foliage painting and landscape layers (generated meshes and tilemaps cover NodeTool's use).
- Cinematic sequencer at Unreal's level. NodeTool already has a timeline and storyboard product.

## What exists today

| Area | 2D (engine "1", schema 1–2) | 3D (engine "2", schema 3) |
|---|---|---|
| Renderer | WebGPU instanced sprite batches, Canvas2D fallback. Tilemaps, parallax backgrounds, 2D point lights (max 32), bloom, LUT, brightness/contrast. | three.js `WebGLRenderer` 0.185 on WebGL2. `MeshStandardMaterial` PBR, ACES tone mapping, one shadow-casting directional light (PCF soft), point and spot lights without shadows, linear fog, solid-colour background. |
| Physics | Custom swept AABB, static and kinematic bodies only, one-way platforms, tile solids. | Rapier 0.19 with static, kinematic and dynamic bodies, box, sphere, capsule, convex hull and triangle mesh colliders, layers, sensors, CCD, character controller, ray and shape queries. |
| Audio | Web Audio one-shots and looping music with fades, 32 voices, no spatialisation. | Same player. |
| Animation | Sprite-sheet clips, tweens on rotation, scale, opacity and tint. | glTF clips with one crossfade between consecutive clips. |
| Scripting | QuickJS, one pure function per behavior, returns commands, per-call and per-tick budgets. | Same model with a 3D command set and physics queries. |
| Determinism | Fixed 60 Hz tick, seeded RNG, snapshots, replay. | Same, with Rapier state serialized into the snapshot. |
| Editor | Scene tree, inspector, 2D viewport with move/rotate/scale gizmos and grid snap, collider overlay, script pane, revisions, changes list, agent panel, save/load play state, replay. | Hierarchy, schema-driven inspector, orbit and fly camera, translate/rotate/scale gizmo with snap, overlays, script pane, agent panel. |
| Export | Static web build. | Static web build with hashed assets. |

## Engine gaps

### Rendering (3D)

**G1. P0. The 3D renderer is WebGL2 only.** The 2D path already runs on WebGPU, and three.js 0.185 ships `WebGPURenderer` with TSL node materials and a WebGL2 fallback. Moving to it is the prerequisite for compute-based particles (G10), GPU culling, modern post-processing (G3) and the shared GPU device with `packages/gpu`. Unity's URP and HDRP, and Unreal, are both built on a compute-capable pipeline.

**G2. P0. No image-based lighting or sky.** The background is a solid colour (`gameEnvironment3D.background`) and ambient light is a flat colour. PBR materials look flat without an environment map. Missing: HDRI skybox, PMREM-filtered reflection and irradiance, a procedural sky with sun direction linked to the directional light, and reflection probes. This is the single largest visual gap per hour of work, and NodeTool can generate equirectangular HDRIs.

**G3. P0. No 3D post-processing stack.** 2D has bloom and LUT. 3D has ACES tone mapping only. Missing, in rough order of value: exposure control, bloom, SSAO or GTAO, colour grading and LUT (reuse the 2D LUT asset), TAA or SMAA, depth of field, vignette, motion blur, SSR. Unity's Volume and Unreal's Post Process Volume make this a per-scene or per-region profile, which suits a document field on `gameEnvironment3D`.

**G4. P1. Shadows are limited to one directional light.** No cascaded shadow maps (a single 30 m extent shadow map at up to 2048 px makes larger scenes blurry or clipped), no point or spot light shadows, no contact shadows. Cascades and per-light shadow toggles are expected.

**G5. P1. Materials are a fixed subset of glTF PBR.** `gameMaterial3D` has colour, metalness, roughness, opacity, emissive and alpha mode. Primitives have no texture slots, so a generated texture cannot be applied to a box or plane. Missing: base colour, normal, ORM and emissive maps for primitives, UV tiling, `KHR_materials_*` extensions beyond unlit, emissive strength and texture transform (clearcoat, transmission, sheen, specular, IOR), and custom or toon shaders. Stylised looks (toon, outline, unlit pixel) are common in generated games and need a shader or material-preset path.

**G6. P1. No instancing, batching or LOD.** Every entity is its own mesh and draw call. There is no `InstancedMesh` or `BatchedMesh` for repeated props, no LOD switching and no HLOD. With 4,096 entities per scene allowed, draw-call count, not triangle count, is the first wall.

**G7. P1. Generated models can hit the budget and cannot be compressed.** Preparation rejects Draco, meshopt and KTX2/Basis (`renderer3d/preparation.ts:148`). Generated models (Meshy, Tripo, Hunyuan, TRELLIS) are often 10–50 MB with 4K textures. Without mesh simplification, meshopt compression and KTX2 texture transcoding in the prepare step, web load times and GPU memory are poor. Unity and Unreal do this at import.

**G8. P2. Lighting baking.** No lightmaps or baked light probes. For static scenes this is how Unity and Unreal ship good GI cheaply. A server-side bake (headless Blender already exists in `blender-nodes`) would fit NodeTool better than an in-browser baker.

**G9. P2. No decals, no volumetric fog, only linear fog.** Exponential height fog and decals (bullet holes, footprints, generated graffiti) are cheap wins once G1 lands.

### Rendering (2D)

**G10. P0. No particle system in either engine.** Effects today are spawned prefabs with a lifetime tween, one entity per particle, capped by `MAX_GAME_SPAWNED_INSTANCES = 1024`. Unity's Shuriken and VFX Graph and Unreal's Niagara are central to game feel. Needed: an emitter component with rate and burst, lifetime curves for size, colour and velocity, gravity, collision with the world (optional), sub-emitters, and GPU simulation on WebGPU. Particles must be presentation-only, so they stay outside the deterministic snapshot.

**G11. P1. 2D lighting has no normal maps or shadows.** Point lights are additive radial falloff. Unity's 2D URP has normal-mapped sprites, shadow casters and freeform lights. Generated sprites can get normal maps from a depth-estimation model, so this fits the asset pipeline.

**G12. P2. No 9-slice sprites, sprite masks or 2D custom shaders.** Needed for UI panels (G21) and stylised effects (dissolve, outline, palette swap).

### Physics

**G13. P0. 2D physics has no dynamic bodies.** `body2d.type` is `static` or `kinematic`. There is no mass, no stacking, no rigid-body response, no rotation of colliders and only boxes. Rapier has an official 2D build (`@dimforge/rapier2d-compat`) with the same API and determinism story as the 3D one already in use. Moving 2D onto it would give circles, capsules, polygons, slopes, joints, raycasts and dynamic bodies, and replace the custom sweep code.

**G14. P1. 2D broad phase is quadratic.** `solidsNear` scans every obstacle state for every moving body (`session.ts:588-605`). This is fine at tens of entities and slow at hundreds. G13 removes it. If G13 is deferred, a uniform grid fixes it.

**G15. P1. No joints in 3D.** Rapier supports fixed, revolute, prismatic, spherical and rope joints and motors. None is exposed in `gameEntity3D`. Doors, chains, vehicles, ragdolls and physics puzzles need them.

**G16. P1. No physics materials or combine rules.** Friction and restitution are per collider, with no shared material asset and no combine mode (min, max, average, multiply). Unity and Unreal both use physics material assets.

**G17. P2. No vehicles, ragdolls, cloth or destruction.** Ragdolls follow from G15 and skinned models. Vehicle physics is a Rapier `DynamicRayCastVehicleController`. Cloth and destruction are lower value.

**G18. P2. One physics step per tick, no substeps or solver settings.** Fast objects rely on CCD only. Exposing solver iterations and substeps per scene would match Unity's and Unreal's project physics settings.

### Audio

**G19. P0. No spatial audio.** Every voice connects straight to `context.destination` (`audio.ts:153`). There is no `PannerNode`, no listener, no distance attenuation, no doppler, and 3D `audioSource` positions are ignored. This is the largest audio gap for a 3D engine.

**G20. P1. No mixer, buses or effects.** Unity's Audio Mixer and Unreal's MetaSounds and Submixes give music, SFX, voice and UI buses with volume, ducking (music under dialogue), snapshot transitions, reverb zones, low-pass occlusion and a master limiter. None exists. Also missing: pitch and volume randomisation per play, random containers (pick one of N footsteps), and priority-based voice stealing (today the oldest one-shot is stolen).

**G21. P2. No streaming for long audio.** Music is fully decoded with `decodeAudioData`, which for a five-minute track is about 50 MB of PCM. A `MediaElementAudioSourceNode` path for music fixes it.

### Animation

**G22. P0. No animation state machine or blending.** `animator3d` maps names to clips and the runtime crossfades from the previous clip to the current one. Missing: a state graph with parameters and transitions (Unity's Animator Controller, Unreal's AnimGraph), 1D and 2D blend spaces (idle, walk, run by speed), layers with masks (upper-body shoot while running), additive clips, root motion and animation events (footstep sound on frame). Characters generated with Mixamo-style rigs cannot look professional without blend spaces.

**G23. P1. No retargeting or shared animation libraries.** Clips are bound to the model they came in. Generated characters usually arrive without animations, so a humanoid retargeting step that applies a shared clip library to any humanoid rig would unlock most of them. Unity's Humanoid Avatar and Unreal's IK Retargeter do this.

**G24. P2. No IK.** Foot placement on slopes and look-at are the two that matter. three.js has CCD IK, and two-bone IK is small.

**G25. P2. No general tween or curve tracks in 3D.** 2D has `visualAnimation` tracks. 3D has `setVisual` commands only. Moving platforms and doors need keyframed transform tracks without scripts.

### Gameplay runtime and scripting

**G26. P0. Script cost grows with scripts × entities.** Each script call serialises the full input, including the whole `world` array, into a source string and re-evaluates it (`scripts.ts:243-246`, `session3d.ts:272`). With 50 scripted entities in a 500-entity scene that is 50 × 500 entity records compiled as code every tick. Needed: pass `world` once per tick as a shared value, let scripts query nearby entities instead of receiving all of them, and keep compiled functions resident.

**G27. P1. Scripts see too little of the world.** The 3D world entry has position, velocity and grounded only. There is no rotation, no tags or groups, no custom properties per entity and no way to read another entity's script state. Unity's tags, layers and `GetComponent` and Unreal's actor tags and gameplay tags are how gameplay code finds things. A tag field on entities and an `entity.props` bag the inspector can edit would cover most uses.

**G28. P1. No timers, coroutines or lifecycle hooks.** Scripts are a stateless per-tick function. Common patterns (wait 2 s then spawn, on start, on destroy, on enter scene) must be hand-written with tick counters. A small set of declarative helpers would cut script size and agent errors.

**G29. P1. No AI navigation.** No navmesh, pathfinding or steering. Enemies in generated games patrol on a line. Recast via `recast-navigation-js` (WASM) generates navmeshes from colliders and provides crowd simulation, which matches Unity's NavMesh and Unreal's Navigation System. For 2D, grid A* over tilemaps is enough.

**G30. P1. No player save system.** Save play state is an editor tool backed by `localStorage`. Shipped games cannot persist progress, settings or high scores. The deterministic snapshot is already a full save format, so this is mostly API and UI.

**G31. P2. No scene additive loading or persistent objects.** A scene transition replaces everything. A persistent player or HUD across levels needs a "don't destroy on load" equivalent or additive scenes.

**G32. P2. No events between entities with payloads.** `emit` sends a name with no data and no target.

### Input

**G33. P0. Bindings are derived from action names and cannot be configured.** `actionKeys3D("fire")` returns `Mouse0` and `KeyF`, and any other action maps to `Key<ACTION>` (`input3d.ts:4-7`). There is no input map in the document, no gamepad support (`getGamepads` is never called), no rebinding UI for players, and no touch controls in the 3D standalone player. Unity's Input System and Unreal's Enhanced Input both separate actions from bindings. A `inputBindings` section with keyboard, mouse, gamepad and touch per action is the fix, and it also fixes F22.

### UI and HUD

**G34. P0. The HUD is text labels only.** `gameHudLabel` supports text, position, size, colour and font. There are no images, health bars, buttons, panels, layout or anchors, and no menus (title screen, pause, game over, settings). Every finished game needs these. Unity's UI Toolkit and Unreal's UMG are full layout systems. A minimal retained HUD tree with image, nine-slice panel, bar, text and button nodes, anchored to screen edges, would cover most games. NodeTool's mini-app widgets could be a reference for layout.

**G35. P2. No localisation or rich text.** Text has no string tables, no markup for colour or icons and no right-to-left support.

### Asset pipeline and content

**G36. P1. No asset variants or overrides at import.** Model import has scale, forward axis and origin. Missing: per-material overrides at import, collider generation options (convex decomposition, not one hull), LOD generation, pivot editing and texture max-size per platform. Unity's import settings and Unreal's static mesh editor are where these live.

**G37. P2. No sprite atlas packing at runtime build.** 2D draws batch by texture. Packing small sprites into atlases at build time reduces draw calls.

### Performance and scale

**G38. P0. No frustum, occlusion or distance culling control and no per-system budgets.** three.js frustum-culls meshes, but there is no distance culling, no culling of simulation for far entities, and nothing reports CPU time per system (physics, scripts, render). Unity's Profiler and Unreal Insights exist because performance work is impossible without them. G51 is the editor half.

**G39. P1. Simulation runs on the main thread.** Physics, scripts and rendering share one thread, and the tick clock drops time after five catch-up steps (`fixed-tick-host.ts:20`). Running the deterministic simulation in a worker and sending render frames to the main thread would keep rendering smooth under script load. The snapshot boundary already separates the two.

**G40. P2. No asset streaming within a scene.** All models in the document load before play. Per-scene asset lists and progressive loading with a loading screen would shorten time to first frame.

### Build and delivery

**G41. P1. No quality tiers or runtime settings.** There is one quality level. Unity's Quality settings and Unreal's scalability groups let a game drop shadows, post-processing and resolution on weak devices. Needed: low, medium and high tiers, dynamic resolution, and a frame-rate cap.

**G42. P2. No PWA or offline packaging, no embed SDK.** The static build is close to a PWA. A manifest and service worker would make games installable and playable offline. An embed snippet with postMessage events would let sites host games.

**G43. P2. No crash and telemetry hooks in shipped games.** NodeTool's error tracing covers the editor, not exported games.

**G44. P2. Multiplayer.** Out of scope as a full system, but the deterministic tick, seeded RNG and serialised Rapier state already allow rollback netcode for small two-to-four-player games. Worth keeping the determinism guarantee intact for that reason.

## Editor gaps

### Viewport and scene manipulation

**G45. P0. No multi-select and group transform in 3D, partial in 2D.** Covered for keyboard actions by F10 and the audit's 3D feature-gap list. The missing piece beyond those is a pivot mode (selection centre or individual origins) and transforming a multi-selection with one gizmo.

**G46. P1. Gizmo and snapping controls are minimal.** Missing: local versus world space toggle, configurable snap increments for move, rotate and scale, vertex and surface snapping (drop on floor), align to ground, and a scene-view orientation gizmo with axis views and orthographic toggle. Unity's scene gizmo and Unreal's snapping bar are expected by any user arriving from those tools.

**G47. P1. No drag-and-drop placement.** Assets and prefabs cannot be dragged from a panel into the viewport to place them on the surface under the cursor. In Unity and Unreal this is the primary way scenes are built.

**G48. P1. No physics and lighting debug views.** 3D overlays show colliders. Missing: contact points and normals, sleeping bodies, raycast visualisation, navmesh (with G29), light range and cone gizmos, shadow cascade view, wireframe, unlit and overdraw view modes. Unreal's view modes and Unity's scene view draw modes.

**G49. P2. No camera bookmarks or multiple viewports.** A game camera preview inset while editing (Unity's camera preview) is the most useful one.

### Content browser and assets

**G50. P0. There is no asset browser.** 3D shows "Model assets" as a collapsed footer in the hierarchy with an install button. 2D lists slots in the scene tree. Unity's Project window and Unreal's Content Browser are the centre of both editors. Needed: a docked panel with thumbnails for every asset, prefab and scene, search and type filters, drag-to-viewport (G47), usage references, and replace-in-place. For NodeTool specifically, each slot should offer "generate", "regenerate with a new prompt" and "pick from candidates" in place, so the generation pipeline is visible in the editor rather than only through the agent.

### Play mode, debugging and profiling

**G51. P0. No profiler or performance overlay.** The status bar shows tick, score and backend. Needed: FPS and frame-time graph, draw calls, triangles, texture memory (the renderer already collects `GameRendererStats3D`), per-system CPU time (physics, scripts, render, audio), script time per entity, and physics body counts. Unity's Stats window and Profiler and Unreal's `stat` commands.

**G52. P1. No console or log panel.** Script errors surface as status text. Needed: a console panel with errors, warnings and script `log` output, filters, entity links (click to select), collapse of repeated messages, and "Ask the assistant" on any line.

**G53. P1. Limited live editing while playing.** Unity lets the user select runtime objects during play, inspect live values and tweak them, then decide whether to keep changes. Here edits rebuild the whole play session (F15). Needed: a live runtime inspector for any entity, pause-and-edit, and "copy runtime values to the document".

**G54. P1. No breakpoints or script debugging.** The script pane has error tools in 2D only (audit 3D gap list). Beyond that, missing: stepping a single entity's script, watching its state over ticks, and a timeline scrubber over the existing replay history (the replay already exists, so scrubbing is mostly UI).

### Inspector and authoring

**G55. P1. The 3D inspector is a schema form with no component-specific editors.** Every component renders as raw fields from Zod. Missing: colour pickers with HDR intensity, curve editors (G10, G25), asset pickers with thumbnails, collider "fit to mesh" buttons, camera preview on camera components, light colour temperature, and a material editor with a live preview sphere. Unity's custom inspectors and Unreal's details panel customisations are what make components approachable.

**G56. P1. Prefabs have no edit mode.** Prefab instances and overrides exist (`GameOverrideFields`). Missing: open a prefab in isolation, nested prefabs, prefab variants, apply and revert overrides per field, and a visual indicator of overridden fields. Unity's prefab workflow is one of its defining features.

**G57. P1. No animation tooling.** No clip preview scrubber on a selected model, no state-machine graph editor (with G22) and no event markers. NodeTool's node graph editor could host the state machine graph, which would keep one graph language.

**G58. P1. No environment and lighting presets.** Scene settings are raw fields for background, ambient, fog and shadows. Unity's Lighting window and Unreal's environment light mixer give sky, sun and post-processing presets. One-click presets ("sunny day", "night", "overcast", "neon interior") would suit both people and the agent.

**G59. P2. No terrain or level-blocking tools beyond primitives.** ProBuilder-style or Unreal Modeling Mode box editing is out of scope at full depth, but extrude and resize-by-face handles on box primitives would speed up greyboxing.

### Professional UX polish

**G60. P1. No keyboard shortcut map or command palette.** Shortcuts exist (F, Delete, Ctrl+Z, arrows in 2D) but are undiscoverable and differ between 2D and 3D. Unity's Shortcut Manager and Unreal's keyboard settings provide a list and rebinding. A command palette would also expose agent actions.

**G61. P1. 2D and 3D editors diverge.** They have different panels, shortcuts, toolbars and feature sets (see the audit's 3D gap list). Unity and Unreal use one editor for both. A shared shell with mode-specific viewport and inspector sections would halve future UI work and remove the inconsistency.

**G62. P1. Layout is fixed.** Panels can be toggled, not docked, tabbed, resized and saved as layouts. Unity's and Unreal's docking layouts are expected for a professional tool, especially with more panels arriving (asset browser, console, profiler).

**G63. P2. No in-editor onboarding.** No empty-scene guidance, no tooltips that explain components, no sample-scene starter beyond templates.

## Coverage against the reference feature spec

Matthias supplied a technology-agnostic engine feature spec on 2026-10-06. Each item is mapped below. "Have" means the code implements it. "Partial" and "Missing" link to the gap that covers it. G64 to G71 are new gaps the spec surfaced.

### 1. Scene and entity-component architecture

| Spec item | Status | Notes |
|---|---|---|
| Composition-based scene graph | Have | `parentId` hierarchy with world transforms, entity components as optional fields. |
| Component registry and reflection | Have | Zod schemas drive validation and the inspector (`gameSchemaFields`). Components are a closed set, not user-extensible. That is intended for agent safety. |
| Prefab and spawning pipeline | Partial | Runtime spawn, despawn and prefab instances exist. Prefab edit mode, nesting and variants are missing (G56). |
| Scene serialization format | Have | JSON game documents with schema versions, op-based edits, revisions and merge. |

### 2. Editor infrastructure and UX

| Spec item | Status | Notes |
|---|---|---|
| Docking workspace and layout persistence | Partial | Fixed Unity-style layout with toggles (G62). No Game view separate from Scene view (G49), no Asset Browser (G50), no Profiler (G51). |
| Project and file management | Have, by design | NodeTool projects and workspace tabs own this. A separate launcher is out of scope. |
| Visual asset browser | Missing | G50. Thumbnails, breadcrumbs, metadata tooltips and drag-and-drop are all part of it. |
| Flycam, orbit, pan, frame selection | Have (3D) | Orbit, fly and F to frame exist. Orbit pivots on the last target, not the selection (G46). |
| Raycast picking | Have | `renderer3d/index.ts:334`. |
| Local vs world gizmos with snapping | Partial | Snapping is a fixed on/off toggle. No local/world toggle (G46). |
| Command-pattern undo/redo with labels | Partial | Undo and redo exist, unlabelled (G64). |
| Debug overlays | Partial | Collider wireframes, camera frustums and grid exist. Selection outline and light bounds are missing (G48, G65). |

### 3. Rendering and post-processing

| Spec item | Status | Notes |
|---|---|---|
| Modern RHI | Partial | 2D on WebGPU, 3D on WebGL2 (G1). |
| PBR with full map set | Partial | glTF models get all maps. Primitives get none (G5). |
| Shadows and SSAO | Partial | One directional shadow. No point shadows, no SSAO (G3, G4). |
| Post-processing chain with tone-mapping curves and AA | Missing in 3D | Fixed ACES and MSAA only (G3). |
| Particle and VFX subsystem | Missing | G10. |
| Fixed-aspect viewport scaling | Partial | Aspect ratio and letterboxing exist. Internal render resolution and scaling modes are missing (G70). |

### 4. Physics and simulation

| Spec item | Status | Notes |
|---|---|---|
| Rigid body dynamics | Have (3D), Missing (2D) | 3D has mass, damping, impulses and velocity. No continuous force or torque command (G68). 2D has no dynamic bodies (G13). |
| Joints | Missing | G15. |
| Collision layers and layer matrix | Partial | Named layers and category/mask bits per collider. No layer-collision matrix editor (G66). |
| Triggers with enter, stay, exit | Have | Sensor colliders emit contact events with phases in 2D and 3D. |
| Determinism controls | Partial | Fixed tick and explicit seed exist. Tick rate is hard-coded to 60 and the editor has no seed field (G69). |

### 5. Scripting and runtime reflection

| Spec item | Status | Notes |
|---|---|---|
| Embedded scripting VM | Have | QuickJS with budgets. |
| Live hot reloading | Partial | A script edit restarts the play session from tick 0 (F15). Reload that keeps state is missing (G67). |
| Two-way property binding | Missing | G27 covers entity properties. Script-declared parameters are missing (G71). |
| Lifecycle hooks | Partial | Update is the only hook. Contact events arrive as data. G28. |
| 2D canvas and UI layout | Missing | G34. |

### 6. Audio

| Spec item | Status | Notes |
|---|---|---|
| Positional 3D audio | Missing | G19. |
| Multi-format streaming | Partial | Compressed one-shots and music work. Music is fully decoded, not streamed (G21). |

### 7. Deployment, tooling and CI

| Spec item | Status | Notes |
|---|---|---|
| Headless verification | Have | `nodetool game simulate` runs ticks headlessly with input files, assertions and replay verification. `nodetool game capture` renders frames. The exported build itself is not smoke-tested (G72). |
| Standalone distribution | Have | `nodetool game build` writes a static web player with hashed assets and no editor code. |
| CI test harness | Have | Vitest suites in `packages/game-runtime/tests` cover sessions, physics regressions, scripts, replay and validation. |

### New gaps from the spec

**G64. P1. Undo has no labels or history list.** `GameDraftStore` keeps an undo stack with no action names. The spec and both reference engines show "Undo Move Player" and a browsable history. 3D undo is also one full-document op per step (audit F17). Labelled, op-level commands fix both.

**G65. P1. No selection outline or light gizmos.** The selected entity is shown only by the transform gizmo. An outline pass for the selection and range or cone gizmos for point and spot lights are standard. This extends G48.

**G66. P1. No layer-collision matrix.** Collision filtering is per collider category and mask bits. A project-level matrix of named layers, as in Unity's Physics settings, is easier to reason about, and the agent can edit it safely.

**G67. P1. Script hot reload restarts play.** Editing a script during play should swap the function and keep the session, entity states and script state where the shape still fits. Today the session is rebuilt from tick 0 (F15). The deterministic snapshot makes "reload and resume from the current tick" straightforward.

**G68. P2. No continuous force or torque commands in 3D.** Scripts can set velocity, apply an impulse or teleport. Thrusters, wind and buoyancy need `addForce` and `addTorque`, which Rapier supports directly.

**G69. P2. Tick rate and seed are not configurable.** `tickRate` is the literal 60 in both schemas. Physics-heavy games want 120 Hz, and slow board games want less. The editor also always plays with one seed, so seed-dependent bugs are hard to reproduce from the UI.

**G70. P2. No internal render resolution or scaling modes.** Missing: a fixed internal resolution with integer scaling for pixel art, a render-scale factor for 3D, and a choice between letterbox, crop and stretch.

**G71. P1. Scripts cannot declare inspector-editable parameters.** A script's tunables (speed, damage, a target entity, an asset) must be edited in source. Unity's serialized fields and Unreal's `UPROPERTY` let designers tune these in the inspector. A declared `params` schema per script behavior, rendered by the existing `SchemaFields`, would cover numbers, colours, entity references and asset references with no editor code per script. It also gives the agent a safe surface for tuning.

**G72. P2. Exported builds are not smoke-tested.** `simulate` and `capture` run against the document, not the files `build` produces. Loading the built player headlessly for N frames and checking for errors would catch missing assets and bundling breaks.

## Top priorities

If the goal is the biggest visible step toward state-of-the-art graphics, physics and audio plus professional UX, this is the order I recommend.

| Order | Gaps | Why first |
|---|---|---|
| 1 | G2, G3 (IBL, sky, 3D post-processing) | Largest visual improvement per day of work. Works on the current WebGL2 renderer, so it does not wait on G1. |
| 2 | G50, G47 (asset browser with in-place generation, drag to place) | Makes NodeTool's main advantage, generated assets, visible in the editor. Also the most-missed Unity panel. |
| 3 | G34, G33 (HUD widgets and menus, input map with gamepad) | Every shipped game needs menus, bars and gamepad support. Today none can be built. |
| 4 | G13 (Rapier 2D) | Removes the custom 2D physics, unlocks dynamic bodies, joints and slopes, and fixes G14. |
| 5 | G19, G20 (spatial audio, mixer) | Audio is the cheapest area to bring to modern standards. Web Audio already has panners, compressors and convolution. |
| 6 | G10 (particles) | Game feel. Best built after G1 to use GPU compute, but a CPU emitter can come first. |
| 7 | G22, G23 (animation state machine, retargeting) | Required for generated characters to move convincingly. |
| 8 | G51, G52, G26, G71, G67 (profiler, console, script cost, script parameters, hot reload) | Needed before scenes grow. G26 is a contained fix with a large payoff. |
| 9 | G1, G7 (WebGPU 3D renderer, model compression) | Foundation for the next tier of rendering and for loading generated models quickly. Larger change. |

The audit's open data-loss and performance findings (F4, F5, F9, F15) should still go before any of these, because F15 makes every editor feature above feel slower than it is.

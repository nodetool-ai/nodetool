---
layout: page
title: "Feature Coverage and Source Reference"
permalink: /game-engine/coverage
description: "Map native game components and host limits to their guides and source implementations."
---

This inventory covers the shipped document components and the authoring, runtime, renderer, and export surfaces behind this guide. A field's presence in a schema is not enough to establish that every host renders or edits it.

![Diagram separating simulation state from renderer, audio, and particle presentation](/assets/game-engine/simulation-presentation.svg)

*Read support at the boundary where you will use it: editor, simulation, capture, or exported player.*

## Documents and components

| Source family | Features covered | Guide |
|---|---|---|
| [2D document](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game2d/index.ts) | Scenes, entry scene, assets, input actions, transform, template entities, metadata | [Scenes](/game-engine/scenes) |
| [2D components](https://github.com/nodetool-ai/nodetool/tree/main/packages/protocol/src/game2d/components) | Sprite, tilemap, camera2d, body2d, collider2d, animator, visualAnimation, light2d, audioSource | [2D graphics](/game-engine/graphics-2d), [physics](/game-engine/physics), [animation](/game-engine/animation), [audio](/game-engine/audio) |
| [3D document and components](https://github.com/nodetool-ai/nodetool/tree/main/packages/protocol/src/game3d) | Transform3d, primitive, model, body3d, collider3d, character3d, camera3d, light3d, animator3d, interactionActor, audioSource, particles, renderCulling, decal3d | [3D graphics](/game-engine/graphics-3d), [physics](/game-engine/physics), [input](/game-engine/input-cameras), [animation](/game-engine/animation) |
| [Entity metadata](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-entity-metadata.ts) | Tags, JSON properties, runtime property commands | [Scenes](/game-engine/scenes), [scripts](/game-engine/scripts) |
| [Input bindings](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-input.ts) | Actions, axes, look, keyboard layouts, mouse, gamepad, touch | [Input and cameras](/game-engine/input-cameras) |
| [Particle schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-particles.ts) | Emission, ranges, shapes, curves, gradients, sub-emitters, 2D and 3D render choices | [Particles](/game-engine/particles) |
| [HUD](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-ui.ts) and [screens](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-screens.ts) | Widgets, layout, safe areas, focus. Screens, transitions, and generated settings are schema-only | [HUD and screens](/game-engine/hud-screens) |
| [Script parameters](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-script-params.ts) and [events](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-script-events.ts) | Typed tunables, references, payloads, entity/tag targeting | [Scripts](/game-engine/scripts) |
| [Saves](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-saves.ts) | Progress/settings data, asynchronous loaded frames, bounded slots | [Saves and replay](/game-engine/saves-replay) |
| [Authoring metadata](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-authoring.ts) | Retained programs, parameters, prefabs, overrides, suppression, detachment | [Construction](/game-engine/construction) |

## Consumers and delivery

| Implementation | What to inspect |
|---|---|
| [Runtime](https://github.com/nodetool-ai/nodetool/tree/main/packages/game-runtime/src) | Validation, document operations, fixed-step systems, physics, script execution, snapshots, restore |
| [2D renderer](https://github.com/nodetool-ai/nodetool/tree/main/packages/game-renderer/src) | Canvas2D/WebGPU drawing, backgrounds, lighting, effect chain, fonts, UI, audio, standalone players |
| [3D renderer](https://github.com/nodetool-ai/nodetool/tree/main/packages/game-renderer/src/renderer3d) | Model preparation and instances, scalar materials, animation, sky, shadows, height fog, projected image decals, post-processing, culling, editor passes |
| [Particle consumers](https://github.com/nodetool-ai/nodetool/tree/main/packages/game-renderer/src/particles) | Seeded presentation simulation, dimension-specific rendering, and isolated inspector previews |
| [Particle inspector](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/game/inspector/editors/ParticleEditor.tsx) and [presets](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game-particle-presets.ts) | Emitter controls, lifetime curves and gradients, deterministic preview, and Fire, Smoke, Sparks, Dust, Magic, Rain, Snow, and Explosion recipes |
| [Editor](https://github.com/nodetool-ai/nodetool/tree/main/web/src/components/game) | Scene tree, selection/gizmos, inspector, asset browser, scripting, Console, Profiler, retained construction |
| [Game tools](https://github.com/nodetool-ai/nodetool/blob/main/packages/system-skills/native-game/SKILL.md) | Agent creation, preparation, editing, playtesting, capture, and build |
| [CLI](https://github.com/nodetool-ai/nodetool/blob/main/packages/cli-game/src/commands/game.ts) | Validate, simulate, benchmark, capture, build, and smoke commands |

## Compatibility and incomplete paths

New 2D games use schema 4 with engine version `3`. Legacy schemas 1 and 2 use engine `1`. Schema 2 introduces the expanded presentation features. Schema 4 adds entity metadata and script parameters. Reserved 2D schema 5 with engine `4` is rejected as unavailable by the current runtime. 3D uses schema 3 with engine `2`.

The following limits matter when choosing a workflow:

- 2D has static and kinematic physics. 3D has Rapier rigid bodies and a character controller. Triangle meshes are static-only.
- 3D renders with WebGL2. Its particle field is ticked by editor play, standalone, and capture hosts.
- 3D particle sprite sheets, separate material textures, named material lookup, toon shading, and outlines are not completed renderer paths. Embedded supported GLB textures remain available.
- HDRI callback contracts exist, but the standard hosts do not complete their preparation and loading path. Solid and procedural skies work.
- Height fog and projected decals are available in 3D. Decals require prepared images and supported rigid receivers, with an authored scene limit and bounded projection work. See [3D graphics](/game-engine/graphics-3d).
- Built-in localization is outside this guide's shipped baseline.
- Multiplayer, navigation meshes, terrain streaming, vehicles, ragdolls, retargeting, and root motion are not supplied by the current engine.

Feature screenshots and their exact source revision are recorded in [screenshot provenance](/game-engine/screenshots). The source links above follow main and may contain later additions than the captured guide baseline.

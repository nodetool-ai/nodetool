---
layout: page
title: "Game Engine"
permalink: /game-engine/
description: "Build, playtest, and export 2D and 3D games in NodeTool."
---

Build 2D platformers, shooters, and exploration games, or 3D platformers, first-person games, and puzzles. You edit a game in the [Game Editor](/game-editor), ask the assistant to change it, and publish it or export it as a standalone web or desktop build.

Install a shipped example to see what is possible and to start from a working game. Kindle is a 2D platformer, Lumen is 2D exploration, Neon Drift is a shooter, AETHER is a 3D platformer, BLACKSITE is first person, and Signal Forge is a 3D interaction puzzle. Ridgeline and Sunrush Kart are also included. [Your first game](/game-engine/quick-start) shows how to install one.

![Signal Forge with its player, amber core, industrial environment, and objective HUD](/assets/game-engine/signal-forge.png)

*Signal Forge, a 3D example.*

## What is supported

A game is either 2D or 3D. It cannot mix the two or change dimension after creation.

- Scenes, entities, tags, properties, and prefabs in both dimensions. See [Scene structure](/game-engine/scenes).
- 2D sprites, tilemaps, scrolling backgrounds, lighting, and screen effects. See [2D graphics](/game-engine/graphics-2d).
- 3D models, primitives, materials with plain color, roughness, and metalness values, lights, shadows, height fog, and decals. See [3D graphics](/game-engine/graphics-3d).
- 2D static and kinematic bodies, and 3D rigid bodies with a character controller. See [Physics](/game-engine/physics).
- Sprite clips and visual tracks in 2D, model clips and animation graphs in 3D. See [Animation](/game-engine/animation).
- Particle presets with a preview in the inspector. See [Particles](/game-engine/particles).
- Music, sound effects, mixing, and spatial sound. See [Audio](/game-engine/audio).
- Keyboard, mouse, gamepad, and touch input, with camera look in 3D. See [Input and cameras](/game-engine/input-cameras).
- Scripts, HUD widgets, and player saves. See [Scripts](/game-engine/scripts), [HUD and UI](/game-engine/hud-screens), and [Saving player progress](/game-engine/saves-replay).
- Standalone web, desktop, and mobile export, and a player in the NodeTool mobile app. See [Publishing](/game-engine/publishing) and [Play on a phone](/game-engine/mobile-player).

## Current limitations

- 3D draws with WebGL2. WebGPU is used for 2D effects only. Where a 2D effect needs a GPU path the browser lacks, optional effects are skipped and required effects report an error.
- 3D materials take values only. Separate texture maps for normals, roughness, or emission, toon shading, and outlines are not rendered. Textures already inside a GLB model do render.
- HDRI skies are not available. Use a solid or procedural sky.
- Menu, pause, and settings screens defined in the document do not run. Build menus from HUD widgets and scripts.
- 3D HUD image widgets are not available. Use text, panels, bars, and buttons.
- The mobile player has not been tested on devices yet.
- There is no built-in localization, multiplayer, navigation meshes, terrain streaming, vehicles, ragdolls, retargeting, or root motion.

## Guide pages

- Start: [Your first game](/game-engine/quick-start), [Game Editor](/game-editor)
- Build: [Scene structure](/game-engine/scenes), [2D graphics](/game-engine/graphics-2d), [3D graphics](/game-engine/graphics-3d), [Assets](/game-engine/assets), [Animation](/game-engine/animation), [Particles](/game-engine/particles), [Audio](/game-engine/audio)
- Play: [Physics](/game-engine/physics), [Input and cameras](/game-engine/input-cameras), [Scripts](/game-engine/scripts), [HUD and UI](/game-engine/hud-screens), [Saving player progress](/game-engine/saves-replay)
- Generate and fix: [Rebuilding generated games](/game-engine/construction), [Debugging](/game-engine/debugging)
- Share: [Publishing](/game-engine/publishing), [Play on a phone](/game-engine/mobile-player)
- Contributors: [Game Engine Coverage](/game-engine/coverage)

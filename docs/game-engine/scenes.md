---
layout: page
title: "Scenes and Prefabs"
permalink: /game-engine/scenes
description: "Build a game from scenes, entities, components, behaviors, and reusable prefabs."
---

A game is a set of scenes. Each scene holds the objects you place in it, plus its camera, environment, and optional music and HUD. The game starts in its entry scene, and a scene transition switches to another one.

![AETHER with repeated platforms and columns arranged into a route](/assets/game-engine/aether.png)

*AETHER's route is built from repeated platforms and columns.*

## Build a scene in the editor

The scene tree lists every object (entity) in the open scene. Use it to select, duplicate, rename, reparent, or delete objects. Drag an entity onto another to group them, for example a lamp under a street pole.

Select an entity to edit it in the inspector. The inspector shows the entity's components. Choose **Add component** to give the object a new ability:

- **Appearance:** sprite, tilemap, primitive shape, or model.
- **Physics:** body and collider. An object only moves or collides when it has them. In 3D, a visible shape does not create a collider by itself.
- **Other:** camera, sound, light, or particles.

Behaviors add game actions such as collecting an item, triggering an event, spawning, health, or a script. Add them from the same inspector. See [Scripts](/game-engine/scripts) for custom logic.

An entity has a name for you to read and a stable ID the game uses internally. Rename freely, because scripts and saves refer to the ID.

In 2D, a transform sets position and a sprite or tilemap supplies the art. In 3D, a transform sets position, rotation, and scale, and a primitive or model supplies the geometry. Physics groups have stricter rules than decorative groups, so read [Physics](/game-engine/physics) before parenting moving bodies.

## Tag and parameterize

Tags mark groups of entities, such as `guard` or `collectible`. Properties store values such as the key a door needs. Scripts can find entities by tag and read properties without relying on display names. Set both in the inspector, or ask the agent to set them.

## Reuse a prefab

A prefab is an object you define once and spawn many times, such as an enemy, a coin, or a bullet. Template entities appear in their own list in the scene tree and do not show up when the game starts. Spawn one from a spawn behavior or a script. Each spawned copy keeps its own health, position, and other state. You can also ask the agent to create a prefab.

For levels placed by rule rather than by hand, such as a row of platforms, generate them with a script and use [rebuilding generated games](/game-engine/construction). It lets you tweak individual generated objects and rebuild the rest.

A scene transition resets the previous scene's behavior state. If progress must survive, use [save commands](/game-engine/saves-replay).

The JSON behind these objects is in the [Game Document Reference](/developer/game-documents).

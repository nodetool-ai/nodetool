---
layout: page
title: "Scenes, Entities, and Prefabs"
permalink: /game-engine/scenes
description: "Organize a native game with stable entities, components, and reusable prefabs."
---

A document declares an entry scene. Each scene owns its entities, active camera, environment, and optional music and HUD. A scene transition changes which scene the session runs.

![AETHER with repeated platforms and columns arranged into a route](/assets/game-engine/aether.png)

*AETHER's repeated architecture illustrates a scene assembled from reusable objects. The image alone does not identify which objects are prefabs. [Capture source](/game-engine/screenshots).*

## Compose an entity

An entity's ID is its stable identity. Its name is a label. Components supply appearance, physics, camera, sound, or particles. Behaviors supply actions such as collection, triggers, spawning, health, or scripts.

In 2D, place sprites and tilemaps with the entity transform. Add a body and collider when an object must move or participate in collisions. In 3D, `transform3d` supplies position, quaternion rotation, and positive scale. Add a primitive or prepared model independently of its collider. Visible geometry does not automatically create physics.

Use the scene tree to select, duplicate, rename, reparent, or delete objects. Group related entities with parent IDs. A physics hierarchy has stricter rules than a decorative hierarchy: scale and competing pose owners are rejected. [Physics](/game-engine/physics) explains the distinction.

## Tag and parameterize

`tags` identify groups such as `guard` or `collectible`. `props` hold JSON data such as a door's required key. Scripts can query tags and read properties without depending on display names.

```json
{
  "op": "update_entity",
  "entity_id": "door",
  "set": {"tags": ["gate"], "props": {"requiredKey": "amber"}}
}
```

This is an `edit_native_game` operation, not a complete document. It replaces each supplied metadata field. A top-level `null` removes the field. Nested `null` remains JSON data. Tags and properties require 2D schema 4 and are supported in 3D schema 3.

## Reuse a prefab

Keep repeated gameplay objects in prefabs and spawn them through a behavior or script. Each instance has its own runtime state. A 3D prefab declares a root, child entities, and external asset and scene references. A template-only entity is excluded from the initial active scene.

Use [retained construction](/game-engine/construction) when you also need generated placement, stable explicit construction keys, per-instance overrides, and rebuild previews. Resetting an override, detaching a generated entity, and deleting it have different effects on future rebuilds.

A scene transition discards the previous scene's behavior state. Persist progress explicitly with [save commands](/game-engine/saves-replay) when it must survive a new session.

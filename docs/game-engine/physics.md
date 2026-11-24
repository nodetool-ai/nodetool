---
layout: page
title: "Physics"
permalink: /game-engine/physics
description: "Add colliders, move characters, and control which objects bump into each other."
---

A visible object and its collider are separate. A sprite or model does not block the player until you give it a collider. Check the result by playing the scene.

## Add a collider

1. Select the entity in the scene tree.
2. In the inspector, choose **Add component** and add a body (**Body 2D** or **Body 3D**), then add a collider (**Collider 2D** or **Collider 3D**).
3. Set the body type and the collider size, then press Play and walk into it.

A 2D solid platform:

```json
{ "id": "ledge", "transform2d": { "x": 6, "y": 3 },
  "body2d": { "type": "static" },
  "collider2d": { "width": 4, "height": 0.5 } }
```

![AETHER player standing on a platform above a gap](/assets/game-engine/aether.png)

*The starting platform in AETHER.*

## Static, kinematic, and dynamic bodies

- **Static** bodies never move. Use them for floors, walls, and platforms.
- **Kinematic** bodies move only when you move them, with a movement behavior or a script command. They push characters and carry riders, but forces do not affect them.
- **Dynamic** bodies are moved by physics: gravity, forces, and collisions. They are available in 3D only.

In 2D you can use static and kinematic bodies. Kinematic bodies can have a velocity and a `gravityScale`. Solid colliders block movement. Sensors detect overlaps without blocking, which suits hazards and trigger areas. A tilemap can supply solid and one-way tiles.

In 3D, colliders can be a box, sphere, or capsule, a convex hull, or a triangle mesh. Triangle meshes work on static bodies only, so use a convex hull for a moving solid. Collider generation from a model works for rigid meshes. Models with skeletons or morph targets need separate, simple collision geometry.

Scene `gravity` is a vector in meters per second squared and defaults to `{x: 0, y: -9.81, z: 0}`. A body's `gravityScale` scales it. Keep physics objects unscaled, and move a body through its character controller or script commands, not by moving a parent and child at the same time.

## Character movement

A 3D character uses a `character3d` component with speed, acceleration, jump speed, a slope limit, step height, and ground snap. Two timing settings make jumps forgiving: coyote ticks let the player still jump just after leaving a ledge, and jump-buffer ticks accept a jump pressed just before landing. You also name the movement axes and the jump action. A follow camera has its own offset, look limits, and collision radius.

The character stays upright. You can turn it left and right, but not tilt it. A character standing on a moving kinematic platform rides along with it, and walls and ceilings still stop it, so a platform cannot push the character through a gap that is too small.

To tune a character, test a flat floor, a slope, a step, a ledge, and a low ceiling, using the same inputs each time.

## Layers: which groups bump into which

Collision layers sort colliders into named groups, such as player, enemy, and pickup. In 3D, add names under `collisionLayers` (up to 16) and set the pairs that should pass through each other in `collisionMatrix`. Any pair you do not list collides. Give a collider a layer by name. In 2D, `category` says which group a collider belongs to and `mask` says which groups it bumps into.

## Surfaces

`physicsMaterials` defines friction and bounciness (`restitution`) once so many colliders can share it. When two surfaces touch, the combine rule (average, min, multiply, or max) decides the result. A collider that references a material takes all four values from it, so do not also set conflicting values on the collider.

`interactionActor` marks a 3D entity as one that can collect items and trigger areas. Use it when the entity has no other component that implies it.

## Apply a force

A 3D script can return `addForce`, `addTorque`, or `addForceAtPoint` for its own dynamic body. Vectors and points are in world space. A force applies for one physics tick, so repeat the command for sustained thrust. To check forces and collisions from a recorded run, see [Game Testing and Replay](/developer/game-testing).

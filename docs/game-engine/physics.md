---
layout: page
title: "Bodies, Collisions, and Characters"
permalink: /game-engine/physics
description: "Author collision shapes, character movement, layers, materials, and forces."
---

A visible object and its collider are separate. Add the collision surface deliberately, then verify it with movement through the actual runtime. A model's appearance or bounds do not prove that it blocks the player.

![AETHER player standing on a platform above a gap](/assets/game-engine/aether.png)

*The starting platform provides a useful place to check grounding, edge departure, jumps, and recovery. This frame does not establish the full route's collision behavior. [Capture source](/game-engine/screenshots).*

## 2D bodies

The current 2D engine supports static and kinematic bodies. Kinematic bodies can have velocity and gravity scaling. Solid colliders block movement. Sensors report interactions without blocking. Tilemaps can supply solid and one-way tiles.

Use unsigned category and mask bitsets to filter collisions. A non-sensor body can collect a collectible. Sensors are suitable for hazards and trigger volumes. The current 2D runtime does not provide Rapier dynamic bodies, friction, or restitution. Do not switch a document to the reserved schema 5 to request them.

## 3D rigid bodies and shapes

3D uses Rapier with static, kinematic, and dynamic bodies. Basic colliders and prepared convex hulls or triangle meshes define the shape. Triangle meshes require static bodies. Use a convex hull for moving solid geometry.

Scene `gravity` is a vector in meters per second squared, defaulting to `{x: 0, y: -9.81, z: 0}`. A body's `gravityScale` scales its response. The 3D document fixes `tickRate` at 60, and physics advances by 1/60 second per tick.

Prepared colliders carry a digest, preparation version, bounds, and geometry counts. Validation and loading check the binding against the bytes. Changing the visible model does not regenerate a collider automatically.

Signal Forge uses a prepared triangle mesh for authored static machinery, alongside separate colliders for moving gates, the shuttle, and the core. Its runtime regressions test four obstacle surfaces, the recorded objective route, snapshot restoration, and recovery. Small decorative details do not each have a collider.

Keep physics transforms unscaled and avoid multiple pose owners in one hierarchy. Move a body through its supported controller or script commands rather than competing parent and child transforms.

## Character movement

`character3d` supplies speed, acceleration, jump speed, slope limit, step height, ground snap, coyote ticks, and jump-buffer ticks. It names the horizontal movement axes and jump action. A follow camera has its own offset, look limits, and collision radius.

Character capsules remain upright. Yaw is supported, but spawn, teleport, and snapshot restoration reject roll or pitch. A supported rider follows a kinematic platform's translation and rotation around its pivot. The capsule's collision solve clips that carry against other solids, including ceilings and walls. A platform cannot force the rider through an obstructed gap.

Test a flat surface, a slope, a step, a ledge, a low ceiling, and the recovery path before tuning jump feel. Preserve the same input route while comparing changes.

## Layers and surfaces

3D `collisionLayers` names up to 16 layers. `collisionMatrix` lists pairs that do **not** collide. Unlisted pairs collide. A collider using a named layer derives its category and mask from that table. Keep its raw bits at their defaults. An unlayered collider uses the first category bit.

`physicsMaterials` shares friction, restitution, and combine rules across colliders. Rules are average, min, multiply, and max. A referenced material supplies all four values, so do not also provide conflicting inline values.

`interactionActor` explicitly opts a 3D entity into collecting or activating triggers. Use it when the intended actor is not adequately described by a visual or movement component.

## Apply a load

A 3D script can return `addForce`, `addTorque`, or `addForceAtPoint` on its own dynamic body. Vectors and points are world-space. Loads apply for one physics tick. Repeat a force command for sustained thrust. Use [recorded replay](/game-engine/saves-replay) to verify forces and collisions across restoration.

## Snapshot compatibility

The physics build identifier includes the runtime stepping revision. Snapshots from an earlier revision are rejected instead of replaying under changed collision behavior. Restore also checks entity handle sets, native object counts, body poses and velocities, collider parents, and primitive shapes against serialized entity state. These checks detect mismatched ownership maps. They do not authenticate the identity of native objects that have identical checked state.

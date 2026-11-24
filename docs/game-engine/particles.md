---
layout: page
title: "Particles"
permalink: /game-engine/particles
description: "Add fire, smoke, sparks, rain, and other particle effects to 2D and 3D games."
---

Particles are visual effects such as fire, smoke, and sparks. They are decoration only. They cannot collide, collect items, change the score, or send game events.

## Start from a preset

![Kindle's Add component menu with the Particles entry enabled](/assets/game-engine/editor-particles-menu.png)

*Select an entity and choose Add component, then Particles. This works in 2D and 3D.*

In the particle inspector, choose a preset and select **Apply preset**. The presets are Fire, Smoke, Sparks, Dust, Magic, Rain, Snow, and Explosion. Applying a preset replaces the entity's emitters and leaves its other components alone. Undo restores the previous setup.

![Fire preset and isolated WebGL2 preview in the 3D particle inspector](/assets/game-engine/editor-particle-preview.png)

*The inspector shows a live preview of the effect while the game itself stays paused.*

The preview updates as you edit. **Pause preview** freezes it and **Restart preview** plays it again from the start. The preview does not run or change your game.

## Edit an emitter

An entity can hold one to eight emitters. Select one to edit it, or use **Add emitter** and **Remove emitter**. Each emitter needs a unique ID. Renaming an emitter updates anything that refers to it.

![Particle size and opacity curves with the color gradient editor](/assets/game-engine/editor-particle-curves.png)

*Size, speed, and opacity curves change a value over the particle's life. The color gradient sets its color over the same time.*

Each emitter controls:

- **Emission:** a steady `rate`, one-off `bursts`, duration, looping, and a maximum number of live particles.
- **Shape:** point, circle, sphere, cone, box, or edge. Cone, box, and edge emit along the local up direction (+Y).
- **Per-particle values:** lifetime, speed, size, rotation, and spin, each a fixed number or a minimum and maximum.
- **Curves and gradient:** size, speed, and opacity over the particle's life, and a color gradient that tints the base color.
- **Forces:** gravity and drag. Local space makes the particles follow the entity as it moves.

```json
"particles": { "emitters": [{
  "id": "sparks", "rate": 0, "bursts": [{ "time": 0, "count": 12 }],
  "shape": { "kind": "cone", "angle": 25 },
  "lifetime": 0.6, "speed": { "min": 2, "max": 5 }, "size": 0.08,
  "color": "#ffcc66", "blend": "additive", "gravity": { "x": 0, "y": -9.8, "z": 0 }
}] }
```

An `onDeath` entry spawns particles from another emitter on the same entity when a particle ends, for example smoke after a spark. Give that second emitter a rate of zero and turn off its automatic start so it only reacts to the first.

A script can trigger a burst:

```js
({ onStart() {
  return { commands: [{ kind: "emitParticles", emitter: "sparks", count: 12 }] };
} })
```

The entity must already have an emitter called `sparks`. Leaving out `count` restarts the emitter's cycle, and leaving out `emitter` uses the first one. Agents and the CLI can apply the same presets through the [particle recipes](https://github.com/nodetool-ai/nodetool/blob/main/packages/system-skills/native-game-reference/SKILL.md#particle-preset-recipes).

Changing scenes clears all particles.

## 2D appearance

The default particle is a soft dot. You can use a sprite instead, either one image or frames from a sprite sheet (set columns, rows, frame count, and cycles). Use normal blending for smoke and additive blending for glowing sparks. Turn on `unlit` so an effect keeps its color in a dark scene.

Particles show in editor play, standalone builds, and captures. The editor and captures draw at most 1024 visible particles at once.

## 3D appearance

Choose a billboard that always faces the camera, a billboard stretched along its direction of travel, or a mesh particle (box, sphere, tetrahedron, or octahedron). Meshes can turn with their velocity and can be lit. Billboards are not lit. Both are affected by fog and post-processing.

`softness` on a billboard fades it where it meets scene geometry, so smoke does not cut a hard line through a wall. It costs extra rendering, so use it where it improves the look. Mesh particles do not support softness.

3D particles ignore sprite images, sprite sheets, and 2D draw layers, and validation reports those settings. Translucent particles can occasionally sort wrongly against other transparent objects.

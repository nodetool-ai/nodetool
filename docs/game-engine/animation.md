---
layout: page
title: "Animation"
permalink: /game-engine/animation
description: "Animate 2D sprites, 3D models, and blend between clips such as idle, walk, and run."
---

Sprites animate by stepping through frames of a sprite sheet, and 3D models animate by playing clips that come with the model. Both are set up in the inspector.

## 2D sprite animation

Prepare a sprite sheet with evenly spaced frames, then add an `animator` to the sprite entity. Its first frames play when the entity appears. Named `clips` hold other sequences, such as `run`. A script command `{kind: "playAnimation", clip: "run"}` starts a clip from its first frame. Sending the same clip again keeps it playing instead of restarting it.

```json
{
  "animator": {
    "frames": [{ "x": 0, "y": 0, "width": 32, "height": 32 }], "ticksPerFrame": 6,
    "clips": { "run": { "frames": [{ "x": 32, "y": 0, "width": 32, "height": 32 }], "ticksPerFrame": 4, "loop": true } }
  }
}
```

To change how a sprite looks without new frames, add `visualAnimation`. Tracks animate rotation, scale, opacity, or tint from one value to another over `durationTicks`, with delay, repeat, ping-pong, and easing. `rotationRate` spins the sprite continuously and cannot be combined with a rotation track.

```json
{ "visualAnimation": {
    "tracks": [{ "property": "opacity", "from": 1, "to": 0.4, "durationTicks": 30, "pingPong": true, "repeat": true }]
} }
```

These tracks change only the picture. They do not move the collider, so use a body or movement command when motion must affect gameplay.

## 3D model animation

![AETHER editor with the explorer model and Animator 3D clip settings](/assets/game-engine/editor-animation.png)

*A model with an Animator 3D component and an initial idle clip.*

When you import a model, the editor lists its clips. Add an `animator3d` to the entity and map your own names (aliases) to those clips. For simple playback, set an initial clip. For anything that reacts to the game, point the animator at an animation graph in `animationGraphs` and edit it in the Animation panel.

### Blend trees: idle, walk, and run

A blend tree mixes clips according to a number. For a character that idles, walks, and runs:

1. Add a float parameter named `speed` to the graph.
2. Add a state with a one-dimensional blend over `speed`: idle at 0, walk at 2, run at 6.
3. In a script, return a `setAnimParam` command with the character's current speed each tick.

At speed 1 the character plays a mix of idle and walk. At speed 4 it plays a mix of walk and run. A two-dimensional blend does the same over two numbers, such as forward speed and sideways speed. Because the blend uses clip aliases, another model with different clip names can reuse the same graph.

### States and transitions

A graph has float, boolean, and trigger parameters, and one or more layers. Each layer holds states. A state plays one clip or a blend. Transitions move between states and can require parameter conditions, a minimum time in the state (`exitTicks`), and a crossfade length. When several transitions could fire, the first one in the list wins. A trigger resets after a transition uses it. A layer that is already crossfading does not start another transition.

The first layer is the base. Later layers add motion on top and can be limited to chosen parts of the model, for example an upper-body wave while the legs keep walking.

Models prepared through the asset tools play at the clip's real length, so changing a blend parameter changes the speed smoothly without restarting the clip. Older model bindings use a simpler timing, and validation tells you if a blend graph needs the model to be prepared again.

Animation does not blend morph targets, and root motion and ragdolls are not supported. Changing an animation does not move physics or a character controller.

---
layout: page
title: "Input and Cameras"
permalink: /game-engine/input-cameras
description: "Map keyboard, mouse, gamepad, and touch controls to game actions and set up 2D and 3D cameras."
---

Players control a game through named actions such as `jump` or `interact`. You declare the actions, then bind keys, mouse, gamepad, and touch controls to them.

![Signal Forge HUD showing WASD movement, Space jump, E interaction, R recovery, and drag look](/assets/game-engine/signal-forge.png)

*Signal Forge shows its controls on screen: WASD, Space, E, R, and drag to look.*

## Set up controls in the editor

1. Open the **Inspector** and switch to its **Game** tab.
2. In **Input actions**, add the name of each action your game uses.
3. Bind those actions to controls. The Inspector lists action names only. Bindings live in the game document's `inputBindings`, which you can edit in the document or ask the **Assistant** panel to change.

This fragment binds `interact` to the E key and an on-screen touch button labeled "Use":

```json
{
  "inputActions": ["interact"],
  "inputBindings": {
    "actions": {
      "interact": [{"kind": "key", "code": "KeyE"},
                   {"kind": "touchButton", "label": "Use"}]
    }
  }
}
```

`key` matches the physical key position, so WASD works on any keyboard layout. `keyValue` matches the typed character. Mouse, gamepad button, gamepad stick, and touch stick bindings use `mouseButton`, `gamepadButton`, `gamepadAxis`, and `touchStick`.

A listed action uses exactly the bindings you list. An empty list removes all controls from it. An action you do not list keeps its default bindings. In 2D, arrows and WASD move and Space maps to `space`. In 3D, Space is `jump`, R is `respawn`, and the left mouse button or F is `fire`.

## Movement axes and mouse look (3D)

3D games also have axes, which give a value from -1 to 1 for movement. An axis can use a pair of keys, a gamepad stick, or a touch stick. When several controls push the same axis, the strongest wins. The default `moveX` and `moveZ` axes use WASD, arrows, and gamepad or touch movement.

Look turns the camera. It accepts mouse motion, a gamepad stick, or touch drag, each with sensitivity and an invert option. When mouse look is bound, the first click captures the mouse for mouse-look. Setting `look: []` turns that off.

On touch screens the player shows the sticks and buttons your bindings declare. One finger can drag to look while another moves the stick. HUD buttons take priority over gameplay controls under the same pointer, and the black bars around the picture do not count as HUD.

## Set up the camera

- **2D camera:** width, height, and zoom set how much of the world is visible.
- **3D camera:** choose either a perspective camera, which uses a field of view in degrees, or an orthographic camera, which uses a size in world units and has no perspective. Set near and far planes close around your scene, because a very wide gap can make distant surfaces flicker.
- **Fixed camera:** stays where you place it. Characters move relative to its facing.
- **Follow camera:** names a target and takes offsets, yaw, pitch limits, sensitivity, and a collision radius so the camera does not pass through walls.

The editor's orbit camera is only for looking around while you edit. Play and capture use the scene's active camera, so check framing there and at the aspect ratio you will publish.

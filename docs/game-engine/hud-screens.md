---
layout: page
title: "HUD and UI"
permalink: /game-engine/hud-screens
description: "Add health bars, text, panels, and buttons to a 2D or 3D game and update them from scripts."
---

The HUD is the interface drawn over your game: health bars, score text, objective panels, and on-screen buttons. It works the same way in 2D and 3D.

![BLACKSITE HUD with objective, armor, and ammunition panels](/assets/game-engine/blacksite.png)

*BLACKSITE's HUD is built from panels, text, and bars, and its player script updates them while the game runs.*

## Build a HUD

There is no visual HUD designer yet. You describe the HUD in the game's `ui` section, either in the document or by asking the **Assistant** panel to add it, then check it in the viewport while you play. This example puts a health bar in the top-right corner:

```json
"ui": { "nodes": [
  { "kind": "panel", "id": "hud", "anchor": {"x": 1, "y": 0}, "pivot": {"x": 1, "y": 0},
    "offset": {"x": -16, "y": 16}, "width": 200, "height": 48 },
  { "kind": "bar", "id": "hp", "parent": "hud", "width": 180, "height": 12,
    "source": {"kind": "health", "entityId": "hero"} }
] }
```

A game-level `ui` shows in every scene. A scene's own `ui` draws on top.

## Widgets

| Widget | What it does |
|---|---|
| `panel` | A colored rectangle, optionally with rounded corners. It can hold child widgets |
| `text` | A line of text with size, color, alignment, and an optional font |
| `bar` | A fill bar for health or any value. Choose the fill direction and colors |
| `button` | A clickable button that presses an input action |
| `image` | Draws an image asset. Works in 2D only |
| `stack`, `grid` | Lay out their children in a row, column, or grid. They draw nothing themselves |

A child widget names its parent with `parent` and follows it in the list. Only panels, stacks, and grids can have children.

## Position widgets

`anchor` picks a point on the parent from 0 to 1 on each axis, so `{x: 1, y: 0}` is the top-right corner. `pivot` picks which point of the widget sits on that anchor. `offset` then nudges the widget in HUD pixels. For a top-right counter, use `{x: 1, y: 0}` for both anchor and pivot and a negative x offset to move it inward. The HUD stays clear of notches and rounded screen corners unless you set `safeArea` to false.

In 2D, the HUD size follows the camera size and pixels per unit. In 3D, set `hudWidth` and `hudHeight` in the game's presentation settings. The HUD is stretched to fill the viewport.

To use a custom font, add it as a font asset (see [Assets](/game-engine/assets)) and set the widget's `fontId`.

## Connect the HUD to gameplay

A bar can follow an entity's health with `"source": {"kind": "health", "entityId": "hero"}`, or show a value your script sets. Scripts change a widget with a `ui` command:

```js
return { commands: [{ kind: "ui", id: "score", text: "Score: 12" }] };
```

A `ui` command can set `text`, `value`, `max`, and `visible`. The change stays until the scene changes and is saved with the game. Naming a widget that does not exist, or a property the widget lacks, fails the step.

A button presses an input action you declared, so scripts see it like a key press. Turn on `focusNavigation` and the gamepad D-pad moves between visible buttons while button 0 presses the focused one. In 3D, the mouse must be released from mouse-look before it can click a button.

The older script `hud` labels still work and draw above the widget tree.

The engine has no translation system, so write each language's text yourself and check that long labels fit.

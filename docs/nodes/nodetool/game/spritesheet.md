---
layout: page
title: "Sprite Sheet"
node_type: "nodetool.game.SpriteSheet"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.SpriteSheet`

**Namespace:** `nodetool.game`

## Description

Describe a generated sprite sheet for a game slot: derive the grid from the cell size, assign each animation a row-major frame range, and stamp the image with the slot fill.
    game, sprite, spritesheet, animation, slot

    Use cases:
    - Fill a spritesheet slot of a game template from a generated sheet
    - Record frame regions and loop flags without slicing the image
    - Reject sheets whose size does not match the cell or hold too few frames

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The generated sprite sheet. | - |
| slot | `game_slot` |  | null |
| cell_width | `int` | Pixel width of one frame. | `32` |
| cell_height | `int` | Pixel height of one frame. | `32` |
| animations | `dict` | Animation name to frame count, in sheet order. A dict or a JSON object string, e.g. {"idle": 4, "run": 8}. | `{}` |
| fps | `int` | Frames per second for every animation. | `8` |
| slot_id | `str` | The manifest slot this sheet fills, e.g. player. | `` |
| loop | `dict` | Per-animation loop overrides, name to boolean. By default every animation loops except jump, hurt, die and attack. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |
| fill | `dict` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.

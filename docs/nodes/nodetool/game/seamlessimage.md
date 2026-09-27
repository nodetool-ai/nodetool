---
layout: page
title: "Seamless Image"
node_type: "nodetool.game.SeamlessImage"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.SeamlessImage`

**Namespace:** `nodetool.game`

## Description

Describe a generated image for a game slot: measure it, compare its opposite edges to decide whether it tiles, and stamp the image with the slot fill.
    game, image, seamless, tileable, background, slot

    Use cases:
    - Fill an image slot of a game template from a generated background
    - Prove a background tiles horizontally before use in a scrolling scene
    - Reject images that a template expects to tile but do not

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The generated image. | - |
| slot | `game_slot` |  | null |
| slot_id | `str` | The manifest slot this image fills, e.g. bg.far. | `` |
| check_x | `bool` | Compare the left and right columns. When off, seamless_x is reported false. | `true` |
| check_y | `bool` | Compare the top and bottom rows. When off, seamless_y is reported false. | `false` |
| threshold | `float` | Largest mean absolute per-channel difference (0-255) between opposite edges that still counts as seamless. | `12` |
| repair | `bool` | Blend the outer 10% on each checked axis before measuring. Preserves dimensions and the center, but softens detail near the edges. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |
| fill | `dict` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.

---
layout: page
title: "Tileset"
node_type: "nodetool.game.Tileset"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.Tileset`

**Namespace:** `nodetool.game`

## Description

Describe a generated tileset for a game slot: derive the grid from the cell size and stamp the image with the slot fill.
    game, tileset, tiles, tilemap, slot

    Use cases:
    - Fill a tileset slot of a game template from a generated sheet
    - Record the cell size and tile count without slicing the image
    - Reject sheets whose size does not match the cell or hold too few tiles

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The generated tileset sheet. | - |
| slot | `game_slot` |  | null |
| cell_width | `int` | Pixel width of one tile. | `16` |
| cell_height | `int` | Pixel height of one tile. | `16` |
| count | `int` | Number of distinct tiles on the sheet, row-major from the top left. | `1` |
| slot_id | `str` | The manifest slot this tileset fills, e.g. tiles.ground. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |
| fill | `dict` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.

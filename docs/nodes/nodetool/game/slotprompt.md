---
layout: page
title: "Slot Prompt"
node_type: "nodetool.game.SlotPrompt"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.SlotPrompt`

**Namespace:** `nodetool.game`

## Description

Turn a native game asset slot into a generation prompt and checker properties.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| slot | `game_slot` |  | null |
| style | `entity` |  | null |
| cast | `list[entity]` |  | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| prompt | `str` |  |
| width | `int` |  |
| height | `int` |  |
| kind | `str` |  |
| checker | `dict` |  |
| seconds | `float` |  |
| reference_images | `list[image]` |  |
| reference_asset_id | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.

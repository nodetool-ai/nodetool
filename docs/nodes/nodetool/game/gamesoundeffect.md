---
layout: page
title: "Game Sound Effect"
node_type: "nodetool.game.SoundEffect"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.SoundEffect`

**Namespace:** `nodetool.game`

## Description

Fits a clip to a game template's sound-effect slot: trims it to the target length with a short fade-out and stamps it with the slot fill.
    audio, game, sfx

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The generated sound effect. | - |
| slot | `game_slot` |  | null |
| slot_id | `str` | The manifest slot this clip fills, e.g. sfx.jump. | `` |
| seconds | `float` | Target length from the manifest slot. | `0.5` |
| trim | `bool` | Cut the clip to the target length with a 10 ms fade-out. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |
| fill | `dict` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.

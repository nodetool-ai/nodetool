---
layout: page
title: "Game Music Loop"
node_type: "nodetool.game.MusicLoop"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.MusicLoop`

**Namespace:** `nodetool.game`

## Description

Fits a track to a game template's music slot: trims it to the target length and crossfades the end into the start so it loops without a click.
    audio, game, music, loop

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The generated music track. | - |
| slot | `game_slot` |  | null |
| slot_id | `str` | The manifest slot this track fills, e.g. music.level. | `` |
| seconds | `float` | Target length from the manifest slot. | `60` |
| crossfade_ms | `int` | How much of the tail is blended into the head to close the loop. | `250` |
| trim | `bool` | Cut the track to the target length before closing the loop. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |
| fill | `dict` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.

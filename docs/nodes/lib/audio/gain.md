---
layout: page
title: "Gain"
node_type: "lib.audio.Gain"
namespace: "lib.audio"
---

**Type:** `lib.audio.Gain`

**Namespace:** `lib.audio`

## Description

Applies a gain (volume adjustment) to an audio file.
    audio, effect, volume

    Use cases:
    - Increase or decrease overall volume of audio
    - Balance levels between different audio tracks
    - Prepare audio for further processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| gain_db | `float` | Gain to apply in decibels. Positive values increase volume, negative values decrease it. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

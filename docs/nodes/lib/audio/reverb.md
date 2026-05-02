---
layout: page
title: "Reverb"
node_type: "lib.audio.Reverb"
namespace: "lib.audio"
---

**Type:** `lib.audio.Reverb`

**Namespace:** `lib.audio`

## Description

Applies a reverb effect to an audio file.
    audio, effect, reverb

    Use cases:
    - Add spatial depth to dry recordings
    - Simulate different room acoustics
    - Create atmospheric sound effects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| room_scale | `float` | Size of the simulated room. Higher values create larger spaces. | `0.5` |
| damping | `float` | Amount of high frequency absorption. Higher values create a duller sound. | `0.5` |
| wet_level | `float` | Level of the reverb effect in the output. | `0.15` |
| dry_level | `float` | Level of the original signal in the output. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

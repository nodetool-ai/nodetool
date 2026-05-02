---
layout: page
title: "Bitcrush"
node_type: "lib.audio.Bitcrush"
namespace: "lib.audio"
---

**Type:** `lib.audio.Bitcrush`

**Namespace:** `lib.audio`

## Description

Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.
    audio, effect, distortion

    Use cases:
    - Create lo-fi or retro-style audio effects
    - Simulate vintage digital audio equipment
    - Add digital distortion and artifacts to sounds

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| bit_depth | `int` | The bit depth to reduce the audio to. Lower values create more distortion. | `8` |
| sample_rate_reduction | `int` | Factor by which to reduce the sample rate. Higher values create more aliasing. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

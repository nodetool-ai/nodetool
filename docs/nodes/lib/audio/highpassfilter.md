---
layout: page
title: "High Pass Filter"
node_type: "lib.audio.HighPassFilter"
namespace: "lib.audio"
---

**Type:** `lib.audio.HighPassFilter`

**Namespace:** `lib.audio`

## Description

Applies a high-pass filter to attenuate frequencies below a cutoff point.
    audio, effect, equalizer

    Use cases:
    - Remove low-frequency rumble or noise
    - Clean up the low end of a mix
    - Create filter sweep effects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| cutoff_frequency_hz | `float` | The cutoff frequency of the high-pass filter in Hz. | `80` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

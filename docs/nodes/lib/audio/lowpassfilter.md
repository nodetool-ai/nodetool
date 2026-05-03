---
layout: page
title: "Low Pass Filter"
node_type: "lib.audio.LowPassFilter"
namespace: "lib.audio"
---

**Type:** `lib.audio.LowPassFilter`

**Namespace:** `lib.audio`

## Description

Applies a low-pass filter to attenuate frequencies above a cutoff point.
    audio, effect, equalizer

    Use cases:
    - Reduce high-frequency harshness
    - Simulate muffled or distant sounds
    - Create dub-style effects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| cutoff_frequency_hz | `float` | The cutoff frequency of the low-pass filter in Hz. | `5000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

---
layout: page
title: "Streaming Low Pass"
node_type: "nodetool.audio.realtime.StreamingLowPass"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingLowPass`

**Namespace:** `nodetool.audio.realtime`

## Description

Applies a low-pass filter to a realtime audio stream, keeping filter state across chunks.
    audio, stream, chunk, realtime, effect, equalizer

    Use cases:
    - Soften a live audio feed
    - Remove high-frequency noise from streaming audio
    - Create realtime dub-style effects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Stream of PCM16LE audio chunks to process. | - |
| cutoff_frequency_hz | `float` | The cutoff frequency of the low-pass filter in Hz. | `5000` |
| q | `float` | Filter resonance (quality factor). | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

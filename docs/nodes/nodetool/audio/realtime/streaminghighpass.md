---
layout: page
title: "Streaming High Pass"
node_type: "nodetool.audio.realtime.StreamingHighPass"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingHighPass`

**Namespace:** `nodetool.audio.realtime`

## Description

Applies a high-pass filter to a realtime audio stream, keeping filter state across chunks.
    audio, stream, chunk, realtime, effect, equalizer

    Use cases:
    - Remove rumble from a live microphone feed
    - Clean up the low end of streaming audio
    - Thin out streaming sources before mixing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Stream of PCM16LE audio chunks to process. | - |
| cutoff_frequency_hz | `float` | The cutoff frequency of the high-pass filter in Hz. | `80` |
| q | `float` | Filter resonance (quality factor). | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

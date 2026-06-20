---
layout: page
title: "Streaming Gain"
node_type: "nodetool.audio.realtime.StreamingGain"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingGain`

**Namespace:** `nodetool.audio.realtime`

## Description

Applies a gain (volume adjustment) to each chunk of a realtime audio stream.
    audio, stream, chunk, realtime, effect, volume

    Use cases:
    - Adjust the level of a live audio feed
    - Balance streaming sources before mixing
    - Attenuate or boost streaming TTS output

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Stream of PCM16LE audio chunks to process. | - |
| gain_db | `float` | Gain to apply in decibels. Positive values increase volume, negative values decrease it. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

---
layout: page
title: "Streaming Bitcrush"
node_type: "nodetool.audio.realtime.StreamingBitcrush"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingBitcrush`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent bitcrush state. Properties apply at the next block.
    audio, stream, effect, realtime

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| bit_depth | `int` | The bit depth to reduce the audio to. Lower values create more distortion. | `8` |
| sample_rate_reduction | `int` | Factor by which to reduce the sample rate. Higher values create more aliasing. | `1` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

---
layout: page
title: "Streaming Reverb"
node_type: "nodetool.audio.realtime.StreamingReverb"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingReverb`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent reverb state. Properties apply at the next block.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| room_scale | `float` | Size of the simulated room. Higher values create larger spaces. | `0.5` |
| damping | `float` | Amount of high frequency absorption. Higher values create a duller sound. | `0.5` |
| wet_level | `float` | Level of the reverb effect in the output. | `0.15` |
| dry_level | `float` | Level of the original signal in the output. | `0.5` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

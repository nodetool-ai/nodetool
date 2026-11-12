---
layout: page
title: "Streaming Noise Gate"
node_type: "nodetool.audio.realtime.StreamingNoiseGate"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingNoiseGate`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent noisegate state. Properties apply at the next block.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| threshold_db | `float` | Threshold in dB below which the gate is active. | `-50` |
| attack_ms | `float` | Attack time in milliseconds. | `1` |
| release_ms | `float` | Release time in milliseconds. | `100` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

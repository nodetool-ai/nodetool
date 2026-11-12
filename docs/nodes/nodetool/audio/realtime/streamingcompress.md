---
layout: page
title: "Streaming Compress"
node_type: "nodetool.audio.realtime.StreamingCompress"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingCompress`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent compress state. Properties apply at the next block.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| threshold | `float` | Threshold in dB above which compression is applied. | `-20` |
| ratio | `float` | Compression ratio. Higher values result in more compression. | `4` |
| attack | `float` | Attack time in milliseconds. | `5` |
| release | `float` | Release time in milliseconds. | `50` |
| auto_gain | `bool` | Apply automatic makeup gain to compensate for the level lost to compression, keeping the output roughly as loud as the input. | `true` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

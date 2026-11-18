---
layout: page
title: "Streaming Limiter"
node_type: "nodetool.audio.realtime.StreamingLimiter"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingLimiter`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent limiter state. Properties apply at the next block.
    audio, stream, effect, realtime

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| threshold_db | `float` | Threshold in dB above which the limiter is applied. | `-2` |
| release_ms | `float` | Release time in milliseconds. | `250` |
| auto_gain | `bool` | Apply automatic makeup gain so the limited peaks reach 0 dBFS, turning the headroom below the ceiling into added loudness (maximizer behaviour). | `true` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

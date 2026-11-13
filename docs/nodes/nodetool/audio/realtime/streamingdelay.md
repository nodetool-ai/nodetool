---
layout: page
title: "Streaming Delay"
node_type: "nodetool.audio.realtime.StreamingDelay"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingDelay`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent delay state. Properties apply at the next block.
    audio, stream, effect, realtime

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| delay_seconds | `float` | Delay time in seconds. | `0.5` |
| feedback | `float` | Amount of delayed signal fed back into the effect. | `0.3` |
| mix | `float` | Mix between the dry (original) and wet (delayed) signals. | `0.5` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

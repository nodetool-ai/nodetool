---
layout: page
title: "Streaming Phaser"
node_type: "nodetool.audio.realtime.StreamingPhaser"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingPhaser`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent phaser state. Properties apply at the next block.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| rate_hz | `float` | Rate of the phaser effect in Hz. | `1` |
| depth | `float` | Depth of the phaser effect. | `0.5` |
| centre_frequency_hz | `float` | Centre frequency of the phaser in Hz. | `1300` |
| feedback | `float` | Feedback of the phaser effect. Negative values invert the phase. | `0` |
| mix | `float` | Mix between the dry (original) and wet (effected) signals. | `0.5` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

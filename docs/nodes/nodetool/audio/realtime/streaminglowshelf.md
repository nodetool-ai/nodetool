---
layout: page
title: "Streaming Low Shelf"
node_type: "nodetool.audio.realtime.StreamingLowShelf"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingLowShelf`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent lowshelffilter state. Properties apply at the next block.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| cutoff_frequency_hz | `float` | The cutoff frequency of the shelf filter in Hz. | `200` |
| gain_db | `float` | The gain to apply to the frequencies below the cutoff, in dB. | `0` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

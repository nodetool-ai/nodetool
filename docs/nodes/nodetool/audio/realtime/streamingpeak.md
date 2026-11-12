---
layout: page
title: "Streaming Peak"
node_type: "nodetool.audio.realtime.StreamingPeak"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingPeak`

**Namespace:** `nodetool.audio.realtime`

## Description

Processes audio chunks with persistent peakfilter state. Properties apply at the next block.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| cutoff_frequency_hz | `float` | The cutoff frequency of the band-pass filter in Hz. | `1000` |
| q_factor | `float` | The Q factor, determining the width of the band. Higher values create narrower bands. | `1` |
| gain_db | `float` | The gain to apply at the centre frequency, in dB. Positive values boost, negative values cut. | `0` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

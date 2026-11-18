---
layout: page
title: "Streaming Distortion"
node_type: "nodetool.audio.realtime.StreamingDistortion"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.StreamingDistortion`

**Namespace:** `nodetool.audio.realtime`

## Description

Applies distortion to each audio chunk. Properties apply at the next block.
    audio, stream, effect, realtime

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| drive_db | `float` | Amount of distortion to apply in decibels. | `25` |
| chunk | `chunk` | Audio signal to process. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

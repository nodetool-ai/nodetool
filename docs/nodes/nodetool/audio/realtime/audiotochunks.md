---
layout: page
title: "Audio To Chunks"
node_type: "nodetool.audio.realtime.AudioToChunks"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.AudioToChunks`

**Namespace:** `nodetool.audio.realtime`

## Description

Slices an audio file into a stream of fixed-duration PCM16 chunks.
    audio, stream, chunk, realtime

    Use cases:
    - Feed batch audio into realtime/streaming nodes
    - Simulate a live audio feed from a recording
    - Drive streaming effects and transcription nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to play as chunks. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| chunk_duration | `float` | Duration of each emitted chunk in seconds. | `0.25` |
| loop | `bool` | Play the clip repeatedly until the run ends. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

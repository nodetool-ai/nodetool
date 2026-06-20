---
layout: page
title: "Chunks To Audio"
node_type: "nodetool.audio.realtime.ChunksToAudio"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.ChunksToAudio`

**Namespace:** `nodetool.audio.realtime`

## Description

Accumulates a stream of PCM16 audio chunks into a single audio file.
    audio, stream, chunk, realtime, accumulate

    Use cases:
    - Capture the output of streaming TTS or effects as a file
    - Terminate a realtime audio chain with a playable result
    - Record a processed live feed

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Stream of PCM16LE audio chunks to accumulate. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

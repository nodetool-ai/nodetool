---
layout: page
title: "Chunk To Audio"
node_type: "nodetool.audio.ChunkToAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.ChunkToAudio`

**Namespace:** `nodetool.audio`

## Description

Aggregates audio chunks from an input stream into AudioRef objects.
    audio, stream, chunk, aggregate, collect, batch

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Stream of audio chunks | `{"type":"chunk","node_id":null,"thread_id":null...` |
| batch_size | `int` | Number of chunks to aggregate per output | `50` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

---
layout: page
title: "Audio Out"
node_type: "nodetool.audio.realtime.AudioOutput"
namespace: "nodetool.audio.realtime"
---

**Type:** `nodetool.audio.realtime.AudioOutput`

**Namespace:** `nodetool.audio.realtime`

## Description

Plays a realtime audio chunk stream — the patch's speaker.
    audio, stream, chunk, realtime, output, speaker, monitor

    Passes every chunk through verbatim; the editor picks the chunks up from the live stream and plays them as they arrive. Terminate any synth patch or streaming effect chain here to hear it.

    Use cases:
    - Monitor a live modular synth patch
    - Hear streaming TTS or effects output as it renders
    - Audition a chain before recording it with ChunksToAudio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Stream of PCM16LE audio chunks to play. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.realtime](./) namespace.

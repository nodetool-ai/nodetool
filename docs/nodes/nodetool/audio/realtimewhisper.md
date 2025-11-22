---
layout: page
title: "Realtime Whisper"
node_type: "nodetool.audio.RealtimeWhisper"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.RealtimeWhisper`

**Namespace:** `nodetool.audio`

## Description

Stream audio input to WhisperLive and emit real-time transcription.
    realtime, whisper, transcription, streaming, audio-to-text, speech-to-text

    Emits:
      - `chunk` Chunk(content=..., done=False) for transcript deltas
      - `chunk` Chunk(content="", done=True) to mark segment end
      - `text` final aggregated transcript when input ends

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | Whisper model size - larger models are more accurate but slower | `tiny` |
| language | `any` | Language code for transcription, or 'auto' for automatic detection | `en` |
| chunk | `any` | The audio chunk to transcribe | `{'type': 'chunk', 'node_id': None, 'content_type': 'text', 'content': '', 'content_metadata': {}, 'done': False}` |
| temperature | `any` | Sampling temperature for transcription | `0.0` |
| initial_prompt | `any` | Optional initial prompt to guide transcription style | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| start | `any` |  |
| end | `any` |  |
| text | `any` |  |
| chunk | `any` |  |
| speaker | `any` |  |
| detected_language | `any` |  |
| translation | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


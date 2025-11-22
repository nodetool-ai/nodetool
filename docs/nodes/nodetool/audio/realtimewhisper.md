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
| model | `Enum['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3']` | Whisper model size - larger models are more accurate but slower | `tiny` |
| language | `Enum['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi', 'tr', 'pl', 'uk', 'vi']` | Language code for transcription, or 'auto' for automatic detection | `en` |
| chunk | `chunk` | The audio chunk to transcribe | `{'type': 'chunk', 'node_id': None, 'content_type': 'text', 'content': '', 'content_metadata': {}, 'done': False}` |
| temperature | `float` | Sampling temperature for transcription | `0.0` |
| initial_prompt | `str` | Optional initial prompt to guide transcription style | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| start | `float` |  |
| end | `float` |  |
| text | `str` |  |
| chunk | `chunk` |  |
| speaker | `int` |  |
| detected_language | `str` |  |
| translation | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


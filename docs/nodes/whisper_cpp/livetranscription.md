---
layout: page
title: "Live Transcription"
node_type: "whisper_cpp.LiveTranscription"
namespace: "whisper_cpp"
---

**Type:** `whisper_cpp.LiveTranscription`

**Namespace:** `whisper_cpp`

## Description

Transcribe streaming PCM16 audio locally with whisper.cpp.
    speech, audio, transcription, streaming

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` |  | - |
| model | `asr_model` |  | `{"type":"asr_model","provider":"whisper_cpp","i...` |
| language | `str` |  | `` |
| prompt | `str` |  | `` |
| vad_threshold | `float` |  | `0.5` |
| min_silence_ms | `int` |  | `500` |
| max_segment_s | `float` |  | `20` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [whisper_cpp](./) namespace.

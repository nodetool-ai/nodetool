---
layout: page
title: "Transcribe"
node_type: "openai.audio.Transcribe"
namespace: "openai.audio"
---

**Type:** `openai.audio.Transcribe`

**Namespace:** `openai.audio`

## Description

Converts speech to text using OpenAI's speech-to-text API.
    audio, transcription, speech-to-text, stt, whisper

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` | The model to use for transcription. | `whisper-1` |
| audio | `audio` | The audio file to transcribe (max 25 MB). | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| language | `enum` | The language of the input audio | `auto_detect` |
| timestamps | `bool` | Whether to return timestamps for the generated text. | `false` |
| prompt | `str` | Optional text to guide the model's style or continue a previous audio segment. | `` |
| temperature | `float` | The sampling temperature between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| words | `list[audio_chunk]` |  |
| segments | `list[audio_chunk]` |  |

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.

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

    Use cases:
    - Generate accurate transcriptions of audio content
    - Create searchable text from audio recordings
    - Support multiple languages for transcription
    - Enable automated subtitling and captioning

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model to use for transcription. | `whisper-1` |
| audio | `any` | The audio file to transcribe (max 25 MB). | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| language | `any` | The language of the input audio | `auto_detect` |
| timestamps | `any` | Whether to return timestamps for the generated text. | `False` |
| prompt | `any` | Optional text to guide the model's style or continue a previous audio segment. | `` |
| temperature | `any` | The sampling temperature between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| words | `any` |  |
| segments | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.


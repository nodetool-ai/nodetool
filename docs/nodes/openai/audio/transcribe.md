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
| model | `Enum['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']` | The model to use for transcription. | `whisper-1` |
| audio | `audio` | The audio file to transcribe (max 25 MB). | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| language | `Enum['auto_detect', 'spanish', 'italian', 'korean', 'portuguese', 'english', 'japanese', 'german', 'russian', 'dutch', 'polish', 'catalan', 'french', 'indonesian', 'ukrainian', 'turkish', 'malay', 'swedish', 'mandarin', 'finnish', 'norwegian', 'romanian', 'thai', 'vietnamese', 'slovak', 'arabic', 'czech', 'croatian', 'greek', 'serbian', 'danish', 'bulgarian', 'hungarian', 'filipino', 'bosnian', 'galician', 'macedonian', 'hindi', 'estonian', 'slovenian', 'tamil', 'latvian', 'azerbaijani', 'urdu', 'lithuanian', 'hebrew', 'welsh', 'persian', 'icelandic', 'kazakh', 'afrikaans', 'kannada', 'marathi', 'swahili', 'telugu', 'maori', 'nepali', 'armenian', 'belarusian', 'gujarati', 'punjabi', 'bengali']` | The language of the input audio | `auto_detect` |
| timestamps | `bool` | Whether to return timestamps for the generated text. | `False` |
| prompt | `str` | Optional text to guide the model's style or continue a previous audio segment. | `` |
| temperature | `float` | The sampling temperature between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| words | `List[audio_chunk]` |  |
| segments | `List[audio_chunk]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.


---
layout: page
title: "Whisper"
node_type: "huggingface.automatic_speech_recognition.Whisper"
namespace: "huggingface.automatic_speech_recognition"
---

**Type:** `huggingface.automatic_speech_recognition.Whisper`

**Namespace:** `huggingface.automatic_speech_recognition`

## Description

Convert speech to text
    asr, automatic-speech-recognition, speech-to-text, translate, transcribe, audio, huggingface

    **Use Cases:**
    - Voice input for a chatbot
    - Transcribe or translate audio files
    - Create subtitles for videos

    **Features:**
    - Multilingual speech recognition
    - Speech translation
    - Language identification

    **Note**
    - Language selection is sorted by word error rate in the FLEURS benchmark
    - There are many variants of Whisper that are optimized for different use cases.

    **Links:**
    - https://github.com/openai/whisper
    - https://platform.openai.com/docs/guides/speech-to-text/supported-languages

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for the speech recognition. | `{'type': 'hf.automatic_speech_recognition', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| audio | `any` | The input audio to transcribe. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| task | `any` | The task to perform: 'transcribe' for speech-to-text or 'translate' for speech translation. | `transcribe` |
| language | `any` | The language of the input audio. If not specified, the model will attempt to detect it automatically. | `auto_detect` |
| timestamps | `any` | The type of timestamps to return for the generated text. | `none` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| chunks | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.automatic_speech_recognition](../) namespace.


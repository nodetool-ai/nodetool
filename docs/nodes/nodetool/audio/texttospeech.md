---
layout: page
title: "Text To Speech"
node_type: "nodetool.audio.TextToSpeech"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.TextToSpeech`

**Namespace:** `nodetool.audio`

## Description

Generate speech audio from text using any supported TTS provider.
    Automatically routes to the appropriate backend (OpenAI, HuggingFace, MLX).
    audio, generation, AI, text-to-speech, tts, voice

    Use cases:
    - Create voiceovers for videos and presentations
    - Generate natural-sounding narration for content
    - Build voice assistants and chatbots
    - Convert written content to audio format
    - Create accessible audio versions of text

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `tts_model` | The text-to-speech model to use | `{'type': 'tts_model', 'provider': 'openai', 'id': 'tts-1', 'name': 'TTS 1', 'path': None, 'voices': ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'], 'selected_voice': ''}` |
| text | `str` | Text to convert to speech | `Hello! This is a text-to-speech demonstration.` |
| speed | `float` | Speech speed multiplier (0.25 to 4.0) | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


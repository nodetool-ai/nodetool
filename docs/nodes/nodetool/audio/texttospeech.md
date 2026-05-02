---
layout: page
title: "Text To Speech"
node_type: "nodetool.audio.TextToSpeech"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.TextToSpeech`

**Namespace:** `nodetool.audio`

## Description

Generate speech audio from text using any supported TTS provider. Automatically routes to the appropriate backend (OpenAI, HuggingFace, MLX).
    audio, generation, AI, text-to-speech, tts, voice

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `tts_model` | The text-to-speech model to use | `{"type":"tts_model","provider":"openai","id":"t...` |
| text | `str` | Text to convert to speech | `Hello! This is a text-to-speech demonstration.` |
| speed | `float` | Speech speed multiplier (0.25 to 4.0) | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

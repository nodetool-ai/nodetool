---
layout: page
title: "TextToSpeech"
node_type: "vertex.audio.TextToSpeech"
namespace: "vertex.audio"
---

**Type:** `vertex.audio.TextToSpeech`

**Namespace:** `vertex.audio`

## Description

Generate speech from text with Gemini text-to-speech models on Vertex AI, billed to your Google Cloud project.
    {...}, text-to-speech, tts, audio, voice

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to convert to speech. | `` |
| voice_name | `enum` | The voice to use for speech generation | `kore` |
| style_prompt | `str` | Optional style prompt to control speech characteristics (e.g., 'Say cheerfully', 'Speak with excitement') | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [vertex.audio](./) namespace.

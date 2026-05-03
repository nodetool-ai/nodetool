---
layout: page
title: "Text To Speech"
node_type: "gemini.audio.TextToSpeech"
namespace: "gemini.audio"
---

**Type:** `gemini.audio.TextToSpeech`

**Namespace:** `gemini.audio`

## Description

Generate speech audio from text using Google's Gemini text-to-speech models.
    google, text-to-speech, tts, audio, speech, voice, ai

    This node converts text input into natural-sounding speech audio using Google's
    advanced text-to-speech models with support for multiple voices and speech styles.

    Supported voices:
    - achernar, achird, algenib, algieba, alnilam
    - aoede, autonoe, callirrhoe, charon, despina
    - enceladus, erinome, fenrir, gacrux, iapetus
    - kore, laomedeia, leda, orus, puck
    - pulcherrima, rasalgethi, sadachbia, sadaltager, schedar
    - sulafat, umbriel, vindemiatrix, zephyr, zubenelgenubi

    Use cases:
    - Create voiceovers for videos and presentations
    - Generate audio content for podcasts and audiobooks
    - Add voice narration to applications
    - Create accessibility features with speech output
    - Generate multilingual audio content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to convert to speech. | `` |
| model | `enum` | The text-to-speech model to use | `gemini-2.5-pro-preview-tts` |
| voice_name | `enum` | The voice to use for speech generation | `kore` |
| style_prompt | `str` | Optional style prompt to control speech characteristics (e.g., 'Say cheerfully', 'Speak with excitement') | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [gemini.audio](../) namespace.

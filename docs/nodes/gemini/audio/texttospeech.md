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

    Use cases:
    - Create voiceovers for videos and presentations
    - Generate audio content for podcasts and audiobooks
    - Add voice narration to applications
    - Create accessibility features with speech output
    - Generate multilingual audio content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | The text to convert to speech. | `` |
| model | `Enum['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']` | The text-to-speech model to use | `gemini-2.5-flash-preview-tts` |
| voice_name | `Enum['Zephyr', 'Puck', 'Nova', 'Quest', 'Echo', 'Fable', 'Orbit', 'Chime', 'Kore', 'Zenith', 'Cosmos', 'Sage', 'Breeze', 'Glimmer', 'Drift', 'Pearl', 'Flux', 'Prism', 'Vega', 'Lyra', 'Ripple', 'Azure', 'Juno', 'River', 'Sterling', 'Atlas', 'Beacon', 'Ember', 'Harmony', 'Spirit']` | The voice to use for speech generation | `Kore` |
| style_prompt | `str` | Optional style prompt to control speech characteristics (e.g., 'Say cheerfully', 'Speak with excitement') | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [gemini.audio](../) namespace.


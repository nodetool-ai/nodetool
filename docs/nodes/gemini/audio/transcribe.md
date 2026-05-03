---
layout: page
title: "Transcribe"
node_type: "gemini.audio.Transcribe"
namespace: "gemini.audio"
---

**Type:** `gemini.audio.Transcribe`

**Namespace:** `gemini.audio`

## Description

Transcribe audio to text using Google's Gemini models.
    google, transcription, speech-to-text, audio, whisper, ai

    This node converts audio input into text using Google's multimodal Gemini models.
    Supports various audio formats and provides accurate speech-to-text transcription.

    Use cases:
    - Convert recorded audio to text
    - Transcribe podcasts and interviews
    - Generate subtitles from audio tracks
    - Create meeting notes from audio recordings
    - Analyze speech content in audio files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to transcribe. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| model | `enum` | The Gemini model to use for transcription | `gemini-2.5-flash` |
| prompt | `str` | Instructions for the transcription. You can customize this to request specific formatting or focus. | `Transcribe the following audio accurately. Retu...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [gemini.audio](../) namespace.

---
layout: page
title: "Text To Speech"
node_type: "openai.audio.TextToSpeech"
namespace: "openai.audio"
---

**Type:** `openai.audio.TextToSpeech`

**Namespace:** `openai.audio`

## Description

Converts text to speech using OpenAI TTS models.
    audio, tts, text-to-speech, voice, synthesis

    Use cases:
    - Generate spoken content for videos or podcasts
    - Create voice-overs for presentations
    - Assist visually impaired users with text reading
    - Produce audio versions of written content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `Enum['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']` |  | `tts-1` |
| voice | `Enum['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']` |  | `alloy` |
| input | `str` |  | `` |
| speed | `float` |  | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.


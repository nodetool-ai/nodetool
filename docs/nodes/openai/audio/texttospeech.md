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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` |  | `tts-1` |
| voice | `enum` |  | `alloy` |
| input | `str` |  | `` |
| speed | `float` |  | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.

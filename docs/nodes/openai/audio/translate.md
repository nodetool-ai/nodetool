---
layout: page
title: "Translate"
node_type: "openai.audio.Translate"
namespace: "openai.audio"
---

**Type:** `openai.audio.Translate`

**Namespace:** `openai.audio`

## Description

Translates speech in audio to English text.
    audio, translation, speech-to-text, localization

    Use cases:
    - Translate foreign language audio content to English
    - Create English transcripts of multilingual recordings
    - Assist non-English speakers in understanding audio content
    - Enable cross-language communication in audio formats

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `audio` | The audio file to translate. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| temperature | `float` | The temperature to use for the translation. | `0.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.


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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to translate. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| temperature | `float` | The temperature to use for the translation. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [openai.audio](../) namespace.

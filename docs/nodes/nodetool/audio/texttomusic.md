---
layout: page
title: "Text To Music"
node_type: "nodetool.audio.TextToMusic"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.TextToMusic`

**Namespace:** `nodetool.audio`

## Description

Generate music from a text prompt using any supported music provider (FAL, Replicate, KIE/Suno, MiniMax). Optionally supply lyrics for vocal models.
    audio, generation, AI, text-to-music, music, song

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `music_model` | The text-to-music model to use | `{"type":"music_model","provider":"replicate","i...` |
| prompt | `str` | Describe the style, mood, genre, and instrumentation | `An upbeat electronic track with a catchy melody...` |
| lyrics | `str` | Optional song lyrics for vocal models (e.g. Suno, MiniMax). Leave empty for instrumental. | `` |
| duration | `float` | Requested duration in seconds (providers clamp to their limits). | `8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](./) namespace.

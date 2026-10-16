---
layout: page
title: "Text to Music"
node_type: "transformers.TextToMusic"
namespace: "transformers"
---

**Type:** `transformers.TextToMusic`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Genre, mood, instruments and tempo of the music. | `Upbeat lo-fi hip hop with a warm piano and soft...` |
| model | `any` | MusicGen model (ONNX-compatible). | - |
| duration | `float` | Length of the music in seconds. | - |
| guidance_scale | `float` | How closely the music follows the prompt. Higher values follow it more closely and vary less. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.

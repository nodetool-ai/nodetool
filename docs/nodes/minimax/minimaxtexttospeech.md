---
layout: page
title: "MiniMax Text to Speech"
node_type: "minimax.TextToSpeech"
namespace: "minimax"
---

**Type:** `minimax.TextToSpeech`

**Namespace:** `minimax`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to convert to speech (up to 10,000 characters). | `Hello, how are you?` |
| voice_id | `str` |  | - |
| model | `enum` | The MiniMax speech model to use. | `speech-2.6-hd` |
| emotion | `enum` | Emotional tone of the speech. 'auto' lets the model decide from the text. | `auto` |
| speed | `float` | Speech speed multiplier. | `1` |
| volume | `float` | Output volume. | `1` |
| pitch | `int` | Pitch shift in semitones. | `0` |
| language_boost | `enum` | Bias pronunciation toward a language. 'auto' autodetects from the text. | `auto` |
| format | `enum` | Output audio format. | `mp3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [minimax](./) namespace.

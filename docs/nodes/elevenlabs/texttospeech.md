---
layout: page
title: "Text to Speech"
node_type: "elevenlabs.TextToSpeech"
namespace: "elevenlabs"
---

**Type:** `elevenlabs.TextToSpeech`

**Namespace:** `elevenlabs`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| voice_id | `str` | ElevenLabs voice ID to use for generation. Connect a Standard Voice node or provide a custom voice ID. | - |
| text | `str` | The text to convert to speech. | `Hello, how are you?` |
| model_id | `enum` | The TTS model to use. | `eleven_monolingual_v1` |
| language_code | `enum` | Language code to enforce (works with Turbo v2.5+). | `none` |
| stability | `float` | Voice stability (0-1). Higher = more consistent. | `0.5` |
| similarity_boost | `float` | Similarity to original voice (0-1). | `0.75` |
| style | `float` | Speaking style emphasis (0-1). | `0` |
| use_speaker_boost | `bool` | Use speaker boost for clearer output. | `false` |
| seed | `int` | Seed for deterministic generation (-1 = random). | `-1` |
| optimize_streaming_latency | `int` | Latency optimization level (0-4). Higher values trade quality for speed. | `2` |
| text_normalization | `enum` | Controls text normalization behavior. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [elevenlabs](./) namespace.

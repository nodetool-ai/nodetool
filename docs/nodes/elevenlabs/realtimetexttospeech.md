---
layout: page
title: "Realtime Text to Speech"
node_type: "elevenlabs.RealtimeTextToSpeech"
namespace: "elevenlabs"
---

**Type:** `elevenlabs.RealtimeTextToSpeech`

**Namespace:** `elevenlabs`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| voice_id | `str` | ElevenLabs voice ID to use for generation. Connect a Standard Voice node or provide a custom voice ID. | - |
| chunk | `chunk` | Text chunk input stream. | `` |
| model_id | `enum` | The TTS model to use. | `eleven_turbo_v2_5` |
| language_code | `enum` | Language code to enforce (works with Turbo v2.5+). | `none` |
| output_format | `enum` | Audio output format for streaming. | `mp3_44100_128` |
| stability | `float` | Voice stability (0-1). | `0.5` |
| similarity_boost | `float` | Similarity to original voice (0-1). | `0.75` |
| style | `float` | Speaking style emphasis (0-1). | `0` |
| use_speaker_boost | `bool` | Use speaker boost for clearer output. | `true` |
| speed | `float` | Speed of generated speech (0.7-1.2). | `1` |
| enable_ssml_parsing | `bool` | Enable SSML parsing in text input. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [elevenlabs](./) namespace.

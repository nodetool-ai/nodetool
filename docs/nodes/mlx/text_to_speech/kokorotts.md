---
layout: page
title: "Kokoro TTS"
node_type: "mlx.text_to_speech.KokoroTTS"
namespace: "mlx.text_to_speech"
---

**Type:** `mlx.text_to_speech.KokoroTTS`

**Namespace:** `mlx.text_to_speech`

## Description

MLX Kokoro text-to-speech.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` | Text content to synthesize into speech. | `Hello from MLX TTS.` |
| speed | `any` | Speech speed multiplier for Kokoro (0.5–2.0). | `1.0` |
| model | `any` | Kokoro model variant to load. | `prince-canuma/Kokoro-82M` |
| voice | `any` | Voice preset supported by Kokoro (e.g. af_heart, am_adam, bf_emma). | `af_heart` |
| language | `any` | Language code | `a` |
| temperature | `any` | Sampling temperature passed to the Kokoro generator. | `0.7` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `any` |  |
| chunk | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_to_speech](../) namespace.


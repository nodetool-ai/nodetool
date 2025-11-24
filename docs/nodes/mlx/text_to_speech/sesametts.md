---
layout: page
title: "Sesame TTS"
node_type: "mlx.text_to_speech.SesameTTS"
namespace: "mlx.text_to_speech"
---

**Type:** `mlx.text_to_speech.SesameTTS`

**Namespace:** `mlx.text_to_speech`

## Description

MLX Sesame / CSM text-to-speech with reference audio cloning.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | Text content to synthesize into speech. | `Hello from MLX TTS.` |
| speed | `float` | Speech speed multiplier for Sesame (0.5–2.0). | `1.0` |
| model | `Enum['mlx-community/csm-1b', 'mlx-community/csm-1b-8bit']` | Sesame/CSM model variant to load. | `mlx-community/csm-1b` |
| reference_audio | `audio` | Reference audio clip used for voice cloning. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_to_speech](../) namespace.


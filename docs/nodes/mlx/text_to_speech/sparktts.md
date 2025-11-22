---
layout: page
title: "Spark TTS"
node_type: "mlx.text_to_speech.SparkTTS"
namespace: "mlx.text_to_speech"
---

**Type:** `mlx.text_to_speech.SparkTTS`

**Namespace:** `mlx.text_to_speech`

## Description

MLX Spark text-to-speech.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | Text content to synthesize into speech. | `Hello from MLX TTS.` |
| speed | `Enum['very_low', 'low', 'moderate', 'high', 'very_high']` | Spark speed preset (very_low, low, moderate, high, very_high). | `moderate` |
| model | `Enum['mlx-community/Spark-TTS-0.5B-bf16', 'mlx-community/Spark-TTS-0.5B-8bit']` | Spark model variant to load. | `mlx-community/Spark-TTS-0.5B-bf16` |
| voice | `Optional[str]` | Optional Spark voice preset. | - |
| pitch | `Enum['very_low', 'low', 'moderate', 'high', 'very_high']` | Spark pitch preset. | `moderate` |
| gender | `Enum['female', 'male']` | Spark voice gender. | `female` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_to_speech](../) namespace.


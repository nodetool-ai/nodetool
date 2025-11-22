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
| text | `any` | Text content to synthesize into speech. | `Hello from MLX TTS.` |
| speed | `any` | Spark speed preset (very_low, low, moderate, high, very_high). | `moderate` |
| model | `any` | Spark model variant to load. | `mlx-community/Spark-TTS-0.5B-bf16` |
| voice | `any` | Optional Spark voice preset. | - |
| pitch | `any` | Spark pitch preset. | `moderate` |
| gender | `any` | Spark voice gender. | `female` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `any` |  |
| chunk | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_to_speech](../) namespace.


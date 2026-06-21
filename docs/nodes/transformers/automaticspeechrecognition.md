---
layout: page
title: "Automatic Speech Recognition"
node_type: "transformers.AutomaticSpeechRecognition"
namespace: "transformers"
---

**Type:** `transformers.AutomaticSpeechRecognition`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | Audio clip to transcribe. | `{"type":"audio"}` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| language | `str` | Optional language hint for multilingual models (e.g. 'english'). | `` |
| task | `enum` | Whether to transcribe in source language or translate to English. | `transcribe` |
| return_timestamps | `bool` | Return per-chunk timestamps alongside the transcript. | `false` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunks | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.

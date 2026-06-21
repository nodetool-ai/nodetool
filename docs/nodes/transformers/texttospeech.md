---
layout: page
title: "Text to Speech"
node_type: "transformers.TextToSpeech"
namespace: "transformers"
---

**Type:** `transformers.TextToSpeech`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to synthesize. | `Hello, this is a test of text to speech.` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| speaker_embeddings | `str` | Optional speaker embedding URL (required by SpeechT5; ignored by other models). | `https://huggingface.co/datasets/Xenova/transfor...` |
| voice | `enum` | Voice ID for Kokoro models (English only in kokoro-js v1.2.x). af_*=American female, am_*=American male, bf_*=British female, bm_*=British male. Ignored by other TTS models. | `af_heart` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.

---
layout: page
title: "Automatic Speech Recognition"
node_type: "huggingface.AutomaticSpeechRecognition"
namespace: "huggingface"
---

**Type:** `huggingface.AutomaticSpeechRecognition`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Automatic-speech-recognition model repo id. | `openai/whisper-large-v3` |
| audio | `audio` | The audio to transcribe. | - |
| return_timestamps | `bool` | Also return per-chunk timestamps. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| chunks | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.

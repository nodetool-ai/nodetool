---
layout: page
title: "Realtime Speech to Text"
node_type: "elevenlabs.RealtimeSpeechToText"
namespace: "elevenlabs"
---

**Type:** `elevenlabs.RealtimeSpeechToText`

**Namespace:** `elevenlabs`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chunk | `chunk` | Audio chunk input stream (base64-encoded PCM16 audio). | `` |
| model_id | `str` | The realtime transcription model to use. | `scribe_v2_realtime` |
| language_code | `str` | ISO 639-1/3 language code. Leave empty for auto-detection. | `` |
| commit_strategy | `enum` | Strategy for committing transcriptions: manual or voice activity detection. | `vad` |
| include_timestamps | `bool` | Include word-level timestamps in the transcription. | `false` |
| include_language_detection | `bool` | Include language detection in the transcription. | `false` |
| vad_silence_threshold_secs | `float` | Silence threshold in seconds for VAD mode. | `1.5` |
| vad_threshold | `float` | Threshold for voice activity detection. | `0.4` |
| min_speech_duration_ms | `int` | Minimum speech duration in milliseconds. | `100` |
| min_silence_duration_ms | `int` | Minimum silence duration in milliseconds. | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [elevenlabs](./) namespace.

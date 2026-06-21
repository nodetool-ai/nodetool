---
layout: page
title: "Speech to Text"
node_type: "elevenlabs.SpeechToText"
namespace: "elevenlabs"
---

**Type:** `elevenlabs.SpeechToText`

**Namespace:** `elevenlabs`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio or video file to transcribe. | `{"type":"audio"}` |
| model_id | `enum` | The transcription model to use. | `scribe_v2` |
| language_code | `str` | ISO-639-1 or ISO-639-3 language code (e.g. 'en', 'es'). Leave empty for auto-detection. | `` |
| tag_audio_events | `bool` | Tag audio events like (laughter), (footsteps), etc. | `true` |
| num_speakers | `int` | Maximum number of speakers (0 = auto-detect, max 32). | `0` |
| timestamps_granularity | `enum` | Granularity of timestamps: none, word, or character. | `word` |
| diarize | `bool` | Annotate which speaker is talking. | `false` |
| file_format | `enum` | Audio format: pcm_s16le_16 for lower latency or other for all formats. | `other` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| language_code | `str` |  |
| language_probability | `float` |  |
| words | `list` |  |
| transcription_id | `str` |  |

## Related Nodes

Browse other nodes in the [elevenlabs](./) namespace.

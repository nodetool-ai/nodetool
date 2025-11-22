---
layout: page
title: "MLX Whisper"
node_type: "mlx.automatic_speech_recognition.Whisper"
namespace: "mlx.automatic_speech_recognition"
---

**Type:** `mlx.automatic_speech_recognition.Whisper`

**Namespace:** `mlx.automatic_speech_recognition`

## Description

Transcribe an audio asset using MLX Whisper.
    whisper, mlx, asr, speech-to-text

    - Uses MLX for efficient Apple Silicon acceleration
    - Returns transcript and segments with optional word-level timestamps

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | Model to use for transcription | `mlx-community/whisper-tiny.en-mlx` |
| audio | `any` | The input audio to transcribe. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| compression_ratio_threshold | `any` | Threshold for gzip compression ratio; above this, the result is treated as failed. | `2.4` |
| logprob_threshold | `any` | Average log probability threshold; below this, the result is treated as failed. | `-1.0` |
| no_speech_threshold | `any` | Threshold for no-speech probability; if exceeded and logprob is low, the segment is considered silent. | `0.6` |
| condition_on_previous_text | `any` | If True, the previous output is used as a prompt for the next window, improving consistency. | `True` |
| word_timestamps | `any` | If True, extracts word-level timestamps using cross-attention and dynamic time warping. | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| segments | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.automatic_speech_recognition](../) namespace.


---
layout: page
title: "Chunks To SRT"
node_type: "huggingface.automatic_speech_recognition.ChunksToSRT"
namespace: "huggingface.automatic_speech_recognition"
---

**Type:** `huggingface.automatic_speech_recognition.ChunksToSRT`

**Namespace:** `huggingface.automatic_speech_recognition`

## Description

Convert audio chunks to SRT (SubRip Subtitle) format
    subtitle, srt, whisper, transcription

    **Use Cases:**
    - Generate subtitles for videos
    - Create closed captions from audio transcriptions
    - Convert speech-to-text output to a standardized subtitle format

    **Features:**
    - Converts Whisper audio chunks to SRT format
    - Supports customizable time offset
    - Generates properly formatted SRT file content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| chunks | `any` | List of audio chunks from Whisper transcription | `[]` |
| time_offset | `any` | Time offset in seconds to apply to all timestamps | `0.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.automatic_speech_recognition](../) namespace.


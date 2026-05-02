---
layout: page
title: "Automatic Speech Recognition"
node_type: "nodetool.text.AutomaticSpeechRecognition"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.AutomaticSpeechRecognition`

**Namespace:** `nodetool.text`

## Description

Transcribe audio to text using automatic speech recognition models.
    audio, speech, recognition, transcription, ASR, whisper

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `asr_model` |  | `{"type":"asr_model","provider":"fal_ai","id":"o...` |
| audio | `audio` | The audio to transcribe | `{"type":"audio","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

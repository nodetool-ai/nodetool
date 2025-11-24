---
layout: page
title: "Automatic Speech Recognition"
node_type: "nodetool.text.AutomaticSpeechRecognition"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.AutomaticSpeechRecognition`

**Namespace:** `nodetool.text`

## Description

Automatic speech recognition node.
    audio, speech, recognition

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `asr_model` |  | `{'type': 'asr_model', 'provider': 'fal_ai', 'id': 'openai/whisper-large-v3', 'name': '', 'path': None}` |
| audio | `audio` | The audio to transcribe | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.


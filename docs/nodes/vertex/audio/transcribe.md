---
layout: page
title: "Transcribe"
node_type: "vertex.audio.Transcribe"
namespace: "vertex.audio"
---

**Type:** `vertex.audio.Transcribe`

**Namespace:** `vertex.audio`

## Description

Transcribe audio to text with Gemini on Vertex AI, billed to your Google Cloud project.
    {...}, transcription, speech-to-text, audio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to transcribe. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Instructions for the transcription. You can customize this to request specific formatting or focus. | `Transcribe the following audio accurately. Retu...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [vertex.audio](./) namespace.

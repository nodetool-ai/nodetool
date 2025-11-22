---
layout: page
title: "Audio Input"
node_type: "nodetool.input.AudioInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.AudioInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to an audio asset for workflows, specified by an 'AudioRef'.  An 'AudioRef' points to audio data that can be used for playback, transcription, analysis, or processing by audio-capable models.
    input, parameter, audio, sound, voice, speech, asset

    Use cases:
    - Load an audio file for speech-to-text transcription.
    - Analyze sound for specific events or characteristics.
    - Provide audio input to models for tasks like voice recognition or music generation.
    - Process audio for enhancement or feature extraction.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` | The audio to use as input. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `any` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.


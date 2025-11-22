---
layout: page
title: "Audio Output"
node_type: "nodetool.output.AudioOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.AudioOutput`

**Namespace:** `nodetool.output`

## Description

Output node for audio content references ('AudioRef').
    audio, sound, media, voice, speech, asset, reference

    Use cases:
    - Displaying or returning processed or generated audio.
    - Passing audio data (as an 'AudioRef') between workflow nodes.
    - Returning results of audio analysis (e.g., transcription reference, audio features).

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` |  | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `any` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.


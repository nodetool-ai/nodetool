---
layout: page
title: "Remove Silence"
node_type: "nodetool.audio.RemoveSilence"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.RemoveSilence`

**Namespace:** `nodetool.audio`

## Description

Removes or shortens silence in an audio file with smooth transitions.
    audio, edit, clean

    Use cases:
    - Trim silent parts from beginning/end of recordings
    - Remove or shorten long pauses between speech segments
    - Apply crossfade for smooth transitions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `audio` | The audio file to process. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| min_length | `int` | Minimum length of silence to be processed (in milliseconds). | `200` |
| threshold | `int` | Silence threshold in dB (relative to full scale). Higher values detect more silence. | `-40` |
| reduction_factor | `float` | Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely. | `1.0` |
| crossfade | `int` | Duration of crossfade in milliseconds to apply between segments for smooth transitions. | `10` |
| min_silence_between_parts | `int` | Minimum silence duration in milliseconds to maintain between non-silent segments | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


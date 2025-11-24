---
layout: page
title: "Repeat"
node_type: "nodetool.audio.Repeat"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.Repeat`

**Namespace:** `nodetool.audio`

## Description

Loops an audio file a specified number of times.
    audio, edit, repeat

    Use cases:
    - Create repeating background sounds or music
    - Extend short audio clips to fill longer durations
    - Generate rhythmic patterns from short samples

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `audio` | The audio file to loop. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| loops | `int` | Number of times to loop the audio. Minimum 1 (plays once), maximum 100. | `2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


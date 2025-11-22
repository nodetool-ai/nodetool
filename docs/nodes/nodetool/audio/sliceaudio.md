---
layout: page
title: "Slice Audio"
node_type: "nodetool.audio.SliceAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.SliceAudio`

**Namespace:** `nodetool.audio`

## Description

Extracts a section of an audio file.
    audio, edit, trim

    Use cases:
    - Cut out a specific clip from a longer audio file
    - Remove unwanted portions from beginning or end

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `any` | The audio file. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| start | `any` | The start time in seconds. | `0.0` |
| end | `any` | The end time in seconds. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


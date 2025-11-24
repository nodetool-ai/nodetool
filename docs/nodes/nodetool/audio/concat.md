---
layout: page
title: "Concat"
node_type: "nodetool.audio.Concat"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.Concat`

**Namespace:** `nodetool.audio`

## Description

Concatenates two audio files together.
    audio, edit, join, +

    Use cases:
    - Combine multiple audio clips into a single file
    - Create longer audio tracks from shorter segments

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| a | `audio` | The first audio file. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| b | `audio` | The second audio file. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


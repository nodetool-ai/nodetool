---
layout: page
title: "Trim"
node_type: "nodetool.audio.Trim"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.Trim`

**Namespace:** `nodetool.audio`

## Description

Trim an audio file to a specified duration.
    audio, trim, cut

    Use cases:
    - Remove silence from the beginning or end of audio files
    - Extract specific segments from audio files
    - Prepare audio data for machine learning models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `any` | The audio file to trim. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| start | `any` | The start time of the trimmed audio in seconds. | `0.0` |
| end | `any` | The end time of the trimmed audio in seconds. | `0.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


---
layout: page
title: "Normalize"
node_type: "nodetool.audio.Normalize"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.Normalize`

**Namespace:** `nodetool.audio`

## Description

Normalizes the volume of an audio file.
    audio, fix, dynamics, volume

    Use cases:
    - Ensure consistent volume across multiple audio files
    - Adjust overall volume level before further processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `audio` | The audio file to normalize. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


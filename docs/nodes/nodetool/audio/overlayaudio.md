---
layout: page
title: "Overlay Audio"
node_type: "nodetool.audio.OverlayAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.OverlayAudio`

**Namespace:** `nodetool.audio`

## Description

Overlays two audio files together.
    audio, edit, transform

    Use cases:
    - Mix background music with voice recording
    - Layer sound effects over an existing audio track

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


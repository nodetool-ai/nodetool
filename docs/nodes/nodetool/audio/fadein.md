---
layout: page
title: "Fade In"
node_type: "nodetool.audio.FadeIn"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.FadeIn`

**Namespace:** `nodetool.audio`

## Description

Applies a fade-in effect to the beginning of an audio file.
    audio, edit, transition

    Use cases:
    - Create smooth introductions to audio tracks
    - Gradually increase volume at the start of a clip

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `any` | The audio file to apply fade-in to. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| duration | `any` | Duration of the fade-in effect in seconds. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


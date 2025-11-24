---
layout: page
title: "Fade Out"
node_type: "nodetool.audio.FadeOut"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.FadeOut`

**Namespace:** `nodetool.audio`

## Description

Applies a fade-out effect to the end of an audio file.
    audio, edit, transition

    Use cases:
    - Create smooth endings to audio tracks
    - Gradually decrease volume at the end of a clip

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `audio` | The audio file to apply fade-out to. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| duration | `float` | Duration of the fade-out effect in seconds. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


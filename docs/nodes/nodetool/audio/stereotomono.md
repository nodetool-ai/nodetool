---
layout: page
title: "Stereo To Mono"
node_type: "nodetool.audio.StereoToMono"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.StereoToMono`

**Namespace:** `nodetool.audio`

## Description

Converts a stereo audio signal to mono.
    audio, convert, channels

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The stereo audio file to convert. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| method | `str` | Method to use for conversion: 'average', 'left', or 'right'. | `average` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

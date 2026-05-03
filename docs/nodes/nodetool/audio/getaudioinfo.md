---
layout: page
title: "Get Audio Info"
node_type: "nodetool.audio.GetAudioInfo"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.GetAudioInfo`

**Namespace:** `nodetool.audio`

## Description

Extract metadata from an audio file: duration, sample rate, channels, format.
    audio, info, metadata, duration, sample_rate, channels, format

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio to inspect. | `{"type":"audio","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| duration | `float` |  |
| sample_rate | `int` |  |
| channels | `int` |  |
| format | `str` |  |
| size_bytes | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

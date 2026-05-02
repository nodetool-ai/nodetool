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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to loop. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| loops | `int` | Number of times to loop the audio. Minimum 1 (plays once), maximum 100. | `2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

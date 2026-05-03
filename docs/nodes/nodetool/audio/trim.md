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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to trim. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| start | `float` | The start time of the trimmed audio in seconds. | `0` |
| end | `float` | The end time of the trimmed audio in seconds. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

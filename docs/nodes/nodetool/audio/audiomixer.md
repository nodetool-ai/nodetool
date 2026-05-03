---
layout: page
title: "Audio Mixer"
node_type: "nodetool.audio.AudioMixer"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.AudioMixer`

**Namespace:** `nodetool.audio`

## Description

Mix up to 5 audio tracks together with individual volume controls.
    audio, mix, volume, combine, blend, layer, add, overlay

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| track1 | `audio` | First audio track to mix. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| track2 | `audio` | Second audio track to mix. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| track3 | `audio` | Third audio track to mix. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| track4 | `audio` | Fourth audio track to mix. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| track5 | `audio` | Fifth audio track to mix. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| volume1 | `float` | Volume for track 1. 1.0 is original volume. | `1` |
| volume2 | `float` | Volume for track 2. 1.0 is original volume. | `1` |
| volume3 | `float` | Volume for track 3. 1.0 is original volume. | `1` |
| volume4 | `float` | Volume for track 4. 1.0 is original volume. | `1` |
| volume5 | `float` | Volume for track 5. 1.0 is original volume. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

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

    Use cases:
    - Mix multiple audio tracks into a single output
    - Create layered soundscapes
    - Combine music, voice, and sound effects
    - Adjust individual track volumes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| track1 | `any` | First audio track to mix. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| track2 | `any` | Second audio track to mix. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| track3 | `any` | Third audio track to mix. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| track4 | `any` | Fourth audio track to mix. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| track5 | `any` | Fifth audio track to mix. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| volume1 | `any` | Volume for track 1. 1.0 is original volume. | `1.0` |
| volume2 | `any` | Volume for track 2. 1.0 is original volume. | `1.0` |
| volume3 | `any` | Volume for track 3. 1.0 is original volume. | `1.0` |
| volume4 | `any` | Volume for track 4. 1.0 is original volume. | `1.0` |
| volume5 | `any` | Volume for track 5. 1.0 is original volume. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


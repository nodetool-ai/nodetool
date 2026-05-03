---
layout: page
title: "Compress"
node_type: "lib.audio.Compress"
namespace: "lib.audio"
---

**Type:** `lib.audio.Compress`

**Namespace:** `lib.audio`

## Description

Applies dynamic range compression to an audio file.
    audio, effect, dynamics

    Use cases:
    - Even out volume levels in a recording
    - Increase perceived loudness of audio
    - Control peaks in audio signals

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| threshold | `float` | Threshold in dB above which compression is applied. | `-20` |
| ratio | `float` | Compression ratio. Higher values result in more compression. | `4` |
| attack | `float` | Attack time in milliseconds. | `5` |
| release | `float` | Release time in milliseconds. | `50` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

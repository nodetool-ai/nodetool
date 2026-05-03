---
layout: page
title: "Limiter"
node_type: "lib.audio.Limiter"
namespace: "lib.audio"
---

**Type:** `lib.audio.Limiter`

**Namespace:** `lib.audio`

## Description

Applies a limiter effect to an audio file.
    audio, effect, dynamics

    Use cases:
    - Prevent audio clipping
    - Increase perceived loudness without distortion
    - Control dynamic range of audio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| threshold_db | `float` | Threshold in dB above which the limiter is applied. | `-2` |
| release_ms | `float` | Release time in milliseconds. | `250` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

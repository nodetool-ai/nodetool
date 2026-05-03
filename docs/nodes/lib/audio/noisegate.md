---
layout: page
title: "Noise Gate"
node_type: "lib.audio.NoiseGate"
namespace: "lib.audio"
---

**Type:** `lib.audio.NoiseGate`

**Namespace:** `lib.audio`

## Description

Applies a noise gate effect to an audio file.
    audio, effect, dynamics

    Use cases:
    - Reduce background noise in recordings
    - Clean up audio tracks with unwanted low-level sounds
    - Create rhythmic effects by gating sustained sounds

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| threshold_db | `float` | Threshold in dB below which the gate is active. | `-50` |
| attack_ms | `float` | Attack time in milliseconds. | `1` |
| release_ms | `float` | Release time in milliseconds. | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

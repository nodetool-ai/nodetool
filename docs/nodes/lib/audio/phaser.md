---
layout: page
title: "Phaser"
node_type: "lib.audio.Phaser"
namespace: "lib.audio"
---

**Type:** `lib.audio.Phaser`

**Namespace:** `lib.audio`

## Description

Applies a phaser effect to an audio file.
    audio, effect, modulation

    Use cases:
    - Create sweeping, swooshing sounds
    - Add movement to static sounds
    - Produce psychedelic or space-like effects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| rate_hz | `float` | Rate of the phaser effect in Hz. | `1` |
| depth | `float` | Depth of the phaser effect. | `0.5` |
| centre_frequency_hz | `float` | Centre frequency of the phaser in Hz. | `1300` |
| feedback | `float` | Feedback of the phaser effect. Negative values invert the phase. | `0` |
| mix | `float` | Mix between the dry (original) and wet (effected) signals. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

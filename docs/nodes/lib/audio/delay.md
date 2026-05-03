---
layout: page
title: "Delay"
node_type: "lib.audio.Delay"
namespace: "lib.audio"
---

**Type:** `lib.audio.Delay`

**Namespace:** `lib.audio`

## Description

Applies a delay effect to an audio file.
    audio, effect, time-based

    Use cases:
    - Create echo effects
    - Add spaciousness to sounds
    - Produce rhythmic patterns

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| delay_seconds | `float` | Delay time in seconds. | `0.5` |
| feedback | `float` | Amount of delayed signal fed back into the effect. | `0.3` |
| mix | `float` | Mix between the dry (original) and wet (delayed) signals. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

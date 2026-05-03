---
layout: page
title: "Pitch Shift"
node_type: "lib.audio.PitchShift"
namespace: "lib.audio"
---

**Type:** `lib.audio.PitchShift`

**Namespace:** `lib.audio`

## Description

Shifts the pitch of an audio file without changing its duration.
    audio, effect, pitch

    Use cases:
    - Transpose audio to a different key
    - Create harmonies or vocal effects
    - Adjust instrument tuning

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| semitones | `float` | Number of semitones to shift the pitch. Positive values shift up, negative values shift down. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

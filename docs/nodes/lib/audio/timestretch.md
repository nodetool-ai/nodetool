---
layout: page
title: "Time Stretch"
node_type: "lib.audio.TimeStretch"
namespace: "lib.audio"
---

**Type:** `lib.audio.TimeStretch`

**Namespace:** `lib.audio`

## Description

Changes the speed of an audio file without altering its pitch.
    audio, transform, time

    Use cases:
    - Adjust audio duration to fit video length
    - Create slow-motion or fast-motion audio effects
    - Synchronize audio tracks of different lengths

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| rate | `float` | Time stretch factor. Values > 1 speed up, < 1 slow down. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

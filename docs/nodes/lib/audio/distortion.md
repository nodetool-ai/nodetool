---
layout: page
title: "Distortion"
node_type: "lib.audio.Distortion"
namespace: "lib.audio"
---

**Type:** `lib.audio.Distortion`

**Namespace:** `lib.audio`

## Description

Applies a distortion effect to an audio file.
    audio, effect, distortion

    Use cases:
    - Add grit and character to instruments
    - Create aggressive sound effects
    - Simulate overdriven amplifiers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| drive_db | `float` | Amount of distortion to apply in decibels. | `25` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

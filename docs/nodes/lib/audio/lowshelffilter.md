---
layout: page
title: "Low Shelf Filter"
node_type: "lib.audio.LowShelfFilter"
namespace: "lib.audio"
---

**Type:** `lib.audio.LowShelfFilter`

**Namespace:** `lib.audio`

## Description

Applies a low shelf filter to boost or cut low frequencies.
    audio, effect, equalizer

    Use cases:
    - Enhance or reduce bass frequencies
    - Shape the low-end response of audio
    - Compensate for speaker or room deficiencies

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| cutoff_frequency_hz | `float` | The cutoff frequency of the shelf filter in Hz. | `200` |
| gain_db | `float` | The gain to apply to the frequencies below the cutoff, in dB. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

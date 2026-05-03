---
layout: page
title: "High Shelf Filter"
node_type: "lib.audio.HighShelfFilter"
namespace: "lib.audio"
---

**Type:** `lib.audio.HighShelfFilter`

**Namespace:** `lib.audio`

## Description

Applies a high shelf filter to boost or cut high frequencies.
    audio, effect, equalizer

    Use cases:
    - Enhance or reduce treble frequencies
    - Add brightness or air to audio
    - Tame harsh high frequencies

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| cutoff_frequency_hz | `float` | The cutoff frequency of the shelf filter in Hz. | `5000` |
| gain_db | `float` | The gain to apply to the frequencies above the cutoff, in dB. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

---
layout: page
title: "Peak Filter"
node_type: "lib.audio.PeakFilter"
namespace: "lib.audio"
---

**Type:** `lib.audio.PeakFilter`

**Namespace:** `lib.audio`

## Description

Applies a peak filter to boost or cut a specific frequency range.
    audio, effect, equalizer

    Use cases:
    - Isolate specific frequency ranges
    - Create telephone or radio voice effects
    - Focus on particular instrument ranges in a mix

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio file to process. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| cutoff_frequency_hz | `float` | The cutoff frequency of the band-pass filter in Hz. | `1000` |
| q_factor | `float` | The Q factor, determining the width of the band. Higher values create narrower bands. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [lib.audio](../) namespace.

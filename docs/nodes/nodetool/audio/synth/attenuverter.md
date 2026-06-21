---
layout: page
title: "Attenuverter"
node_type: "nodetool.audio.synth.Attenuverter"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.Attenuverter`

**Namespace:** `nodetool.audio.synth`

## Description

Scales and offsets a CV (or audio) stream: out = in * scale + offset.
    cv, synthesis, utility, attenuverter, modular

    Negative scale inverts the signal. The Swiss-army CV utility — adapt an LFO's range to a pitch input, invert an envelope, add a constant bias.

    Use cases:
    - Reduce LFO depth before a pitch input
    - Invert an envelope for ducking
    - Add a DC offset to centre a modulation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| signal | `cv` | Input CV or audio stream. | - |
| scale | `float` | Multiplier; negative values invert. | `1` |
| offset | `float` | Constant added after scaling. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| cv | `cv` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

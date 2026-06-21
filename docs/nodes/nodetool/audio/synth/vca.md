---
layout: page
title: "VCA"
node_type: "nodetool.audio.synth.VCA"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.VCA`

**Namespace:** `nodetool.audio.synth`

## Description

Voltage-controlled amplifier: multiplies an audio stream by a CV stream.
    audio, cv, synthesis, vca, amplifier, modular

    Output = audio * gain * max(0, cv) per sample (negative CV is clamped — a VCA doesn't invert). The audio input drives chunk cadence; the CV is frame-aligned with hold-last when it lags or ends. With nothing patched into cv, acts as a plain gain.

    Use cases:
    - Shape a note with an ADSR envelope
    - Tremolo via an LFO
    - Sidechain-style ducking from any CV source

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `chunk` | Audio chunk stream to amplify (drives chunk cadence). | - |
| cv | `cv` | Amplitude control stream; negative values clamp to 0. | - |
| gain | `float` | Constant gain multiplier. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

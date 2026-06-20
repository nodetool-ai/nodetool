---
layout: page
title: "Sample & Hold"
node_type: "nodetool.audio.synth.SampleHold"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.SampleHold`

**Namespace:** `nodetool.audio.synth`

## Description

Samples the signal input on each trigger rising edge and holds it.
    cv, synthesis, sample-hold, modular

    On a trigger rising edge (≥ 0.5) at sample k, the held value becomes signal[k]; the output is the held value every sample. The signal input drives chunk cadence; the trigger is frame-aligned with hold-last.

    Use cases:
    - Classic random-stepped CV (noise → signal, clock → trigger)
    - Quantize an LFO into steps
    - Freeze a modulation value on demand

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| signal | `cv` | Stream to sample (drives chunk cadence). | - |
| trigger | `cv` | Sampling clock — samples on each rising edge (≥ 0.5). | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| cv | `cv` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

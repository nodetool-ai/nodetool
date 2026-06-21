---
layout: page
title: "Gate"
node_type: "nodetool.audio.synth.Gate"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.Gate`

**Namespace:** `nodetool.audio.synth`

## Description

Generates a repeating on/off gate CV pattern — the patch's master clock.
    cv, synthesis, gate, trigger, clock, modular

    Emits `amplitude` for on_duration seconds, 0 for off_duration, cycling wall-clock paced until the run is stopped. Drive an ADSR with it; every node downstream is sample-aligned to it by construction and paced with it.

    Use cases:
    - Trigger envelopes rhythmically
    - Master clock for clocked LFOs and sample & hold
    - Heartbeat of a live patch

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| on_duration | `float` | Gate-high time per cycle in seconds. | `0.25` |
| off_duration | `float` | Gate-low time per cycle in seconds. | `0.25` |
| amplitude | `float` | Gate-high output level. | `1` |
| sample_rate | `int` | Output sample rate in Hz. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| cv | `cv` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

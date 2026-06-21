---
layout: page
title: "ADSR"
node_type: "nodetool.audio.synth.ADSR"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.ADSR`

**Namespace:** `nodetool.audio.synth`

## Description

ADSR envelope generator driven by a gate CV stream.
    cv, synthesis, envelope, adsr, modular

    Gate edges (threshold 0.5) are detected at exact sample offsets inside chunks; attack/decay/release run as exponential one-pole segments counted in samples, so timing is sample-accurate without any clock. Emits one envelope chunk per gate chunk (same frame count). Retriggering mid-release continues from the current level.

    Use cases:
    - Amplitude envelope via VCA cv
    - Filter envelope via VCF cutoff_cv
    - Click-free gating of any signal

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| gate | `cv` | Gate CV stream — values ≥ 0.5 count as gate-high. | - |
| attack | `float` | Attack time in seconds. | `0.01` |
| decay | `float` | Decay time in seconds. | `0.1` |
| sustain | `float` | Sustain level (0–1). | `0.7` |
| release | `float` | Release time in seconds. | `0.3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| cv | `cv` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

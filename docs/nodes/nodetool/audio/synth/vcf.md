---
layout: page
title: "VCF"
node_type: "nodetool.audio.synth.VCF"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.VCF`

**Namespace:** `nodetool.audio.synth`

## Description

Voltage-controlled filter: a biquad whose cutoff is modulated by a CV stream.
    audio, cv, synthesis, vcf, filter, modular

    Cutoff = cutoff_hz * 2^(cv * cv_amount) (volts/octave), recomputed every 64 samples (control rate); filter state persists across chunks so chunked output equals a single pass. The audio input drives chunk cadence; CV is frame-aligned with hold-last.

    Use cases:
    - Classic envelope filter sweeps (ADSR → cutoff_cv)
    - Wah/auto-filter via an LFO
    - Static tone shaping with nothing patched into cutoff_cv

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `chunk` | Audio chunk stream to filter (drives chunk cadence). | - |
| cutoff_cv | `cv` | Cutoff modulation in octaves: cutoff = cutoff_hz * 2^(cv * cv_amount). | - |
| mode | `enum` | Filter mode. | `lowpass` |
| cutoff_hz | `float` | Base cutoff frequency in Hz. | `1000` |
| q | `float` | Filter resonance (quality factor). | - |
| cv_amount | `float` | Octaves of cutoff shift per unit of CV. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

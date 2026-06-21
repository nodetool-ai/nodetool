---
layout: page
title: "LFO"
node_type: "nodetool.audio.synth.LFO"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.LFO`

**Namespace:** `nodetool.audio.synth`

## Description

Low-frequency oscillator emitting a control-voltage stream.
    cv, synthesis, lfo, modulation, modular

    Output is offset + depth * wave(phase). With a clock patched, emits one chunk per clock chunk (sample-aligned) and resets phase on each clock rising edge; otherwise free-runs wall-clock paced until the run is stopped.

    Use cases:
    - Vibrato/tremolo via Oscillator fm or VCA cv
    - Filter sweeps via VCF cutoff_cv
    - Slow parameter drift in generative patches

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| clock | `cv` | Optional clock stream: drives chunk cadence; phase resets on each rising edge. | - |
| waveform | `enum` | LFO waveform. | `sine` |
| rate_hz | `float` | LFO frequency in Hz. | `2` |
| depth | `float` | Output amplitude scale. | `1` |
| offset | `float` | Constant added to the output. | `0` |
| sample_rate | `int` | Free-run sample rate in Hz. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| cv | `cv` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

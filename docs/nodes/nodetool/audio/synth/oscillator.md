---
layout: page
title: "Oscillator"
node_type: "nodetool.audio.synth.Oscillator"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.Oscillator`

**Namespace:** `nodetool.audio.synth`

## Description

Voltage-controlled oscillator generating sine, saw, square, triangle or noise audio.
    audio, synthesis, oscillator, vco, modular

    Pitch CV is volts/octave: freq = frequency * 2^cv (cv in octaves). With pitch_cv or fm patched, output follows that stream's chunk cadence (sample-aligned); otherwise it free-runs wall-clock paced until the run is stopped. Naive waveforms — saw/square alias at high frequencies.

    Use cases:
    - Sound source for a modular synth voice
    - FM/vibrato via the fm input driven by an LFO
    - Melodic sequences via a pitch CV stream

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| pitch_cv | `cv` | Pitch control stream in octaves (volts/octave): freq = frequency * 2^cv. When patched, drives the output chunk cadence. | - |
| fm | `cv` | Linear frequency modulation stream: freq is multiplied by (1 + fm_amount * fm). | - |
| waveform | `enum` | Oscillator waveform. | `sine` |
| frequency | `float` | Base frequency in Hz. | `220` |
| amplitude | `float` | Output amplitude (linear). | `0.8` |
| pulse_width | `float` | Duty cycle for the square waveform. | `0.5` |
| fm_amount | `float` | Depth of linear frequency modulation from the fm input. | `0` |
| sample_rate | `int` | Free-run sample rate in Hz. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

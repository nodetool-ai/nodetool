---
layout: page
title: "Trigger"
node_type: "nodetool.audio.synth.Trigger"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.Trigger`

**Namespace:** `nodetool.audio.synth`

## Description

Fires one gate pulse for each change of its switch, with a pitch value: plays notes by hand while the patch runs.
    cv, synthesis, trigger, gate, note, manual, keyboard, modular

    Each change of trigger starts a gate pulse of length seconds at the next block. A change during a pulse starts the pulse again after one low sample, so the gate rises for every change. The pitch output carries note in octaves (note / 12, volts/octave). The gate stays low until the first change, so a render without a live change is silent.

    Use cases:
    - Play a Sampler voice with one click
    - Start an ADSR envelope by hand
    - Try a note at a chosen pitch

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| trigger | `bool` | Each change fires one gate pulse while the patch runs. | `false` |
| note | `float` | Pitch of the note in semitones. The pitch output carries note / 12. | `0` |
| length | `float` | Gate-high time of one pulse in seconds. | `0.1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| gate | `cv` |  |
| pitch | `cv` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

---
layout: page
title: "Sampler"
node_type: "nodetool.audio.synth.Sampler"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.Sampler`

**Namespace:** `nodetool.audio.synth`

## Description

Plays an audio clip as a polyphonic instrument: each gate trigger starts a voice.
    audio, synthesis, sampler, sample, drum, voice, polyphonic, modular

    Each rising edge of the gate (≥ 0.5) starts a voice at the start of the region. The voice reads pitch_cv at that sample (volts/octave: rate = 2^(cv + tune / 12)) and keeps that rate, so voices at different pitches sound together. When all voices sound, a new trigger replaces the oldest voice. The gate drives chunk cadence (sample-aligned). With no gate patched, the gate is high from the first frame, so the clip plays one time. The output has the channels of the clip.

    Use cases:
    - Play drum hits from gate patterns
    - Play a melody from one recorded note
    - Loop or stutter a slice of a clip

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The clip that the voices play. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| gate | `cv` | Gate CV stream. Each rising edge (≥ 0.5) starts a voice. When patched, drives the output chunk cadence. | - |
| pitch_cv | `cv` | Pitch control stream in octaves (volts/octave). A voice keeps the value of its trigger sample. | - |
| mode | `enum` | one_shot plays each voice to the end of the region. gated fades a voice out when the gate falls. loop also repeats the region. | `one_shot` |
| voices | `int` | Voices that can sound together. A trigger beyond this number replaces the oldest voice. | `8` |
| tune | `float` | Pitch offset in semitones. | `0` |
| start | `float` | Start of the played region in seconds. | `0` |
| length | `float` | Length of the played region in seconds. Zero plays to the end of the clip. The region is at most 30 s. | `0` |
| attack | `float` | Fade-in time of each voice in seconds. | `0` |
| release | `float` | Fade-out time in seconds after the gate falls, in the gated and loop modes. | `0.05` |
| gain | `float` | Output level (linear). | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

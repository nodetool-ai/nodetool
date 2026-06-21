---
layout: page
title: "Mixer"
node_type: "nodetool.audio.synth.Mixer"
namespace: "nodetool.audio.synth"
---

**Type:** `nodetool.audio.synth.Mixer`

**Namespace:** `nodetool.audio.synth`

## Description

Sums up to four audio streams with per-input levels.
    audio, synthesis, mixer, modular

    Output = Σ level_i * in_i, emitted as soon as every still-open input can cover the frames; inputs that have ended contribute silence. The stream ends when all connected inputs end. Assumes matching sample rates and channel counts (no resampling).

    Use cases:
    - Combine oscillators into a richer voice
    - Mix a dry signal with a filtered copy
    - Sub-mix several synth voices

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| in1 | `chunk` | Audio input 1. | - |
| in2 | `chunk` | Audio input 2. | - |
| in3 | `chunk` | Audio input 3. | - |
| in4 | `chunk` | Audio input 4. | - |
| level1 | `float` | Gain for input 1. | `1` |
| level2 | `float` | Gain for input 2. | `1` |
| level3 | `float` | Gain for input 3. | `1` |
| level4 | `float` | Gain for input 4. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio.synth](./) namespace.

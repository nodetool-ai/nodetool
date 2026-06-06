---
layout: page
title: "Audio Mixer"
node_type: "nodetool.audio.AudioMixer"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.AudioMixer`

**Namespace:** `nodetool.audio`

## Description

Mix multiple audio tracks together. Add tracks dynamically with the
"add audio input" button; wire a Gain node upstream of any track that
needs a different level.
    audio, mix, combine, blend, layer, add, overlay

## Properties

All inputs are dynamic — use the "add audio input" button on the node
to add a named audio input handle. Each handle accepts an `audio` ref.

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

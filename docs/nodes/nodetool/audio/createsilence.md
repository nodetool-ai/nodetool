---
layout: page
title: "Create Silence"
node_type: "nodetool.audio.CreateSilence"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.CreateSilence`

**Namespace:** `nodetool.audio`

## Description

Creates a silent audio file with a specified duration.
    audio, silence, empty

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| duration | `float` | The duration of the silence in seconds. | `1` |
| sample_rate | `int` | Sample rate of the generated silence in Hz. | `44100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](./) namespace.

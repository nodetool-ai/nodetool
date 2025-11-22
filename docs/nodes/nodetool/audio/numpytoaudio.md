---
layout: page
title: "Numpy To Audio"
node_type: "nodetool.audio.NumpyToAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.NumpyToAudio`

**Namespace:** `nodetool.audio`

## Description

Convert numpy array to audio.
    audio, numpy, convert

    Use cases:
    - Convert processed audio data back to audio format
    - Create audio from machine learning model outputs
    - Generate audio from synthesized waveforms

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| array | `np_array` | The numpy array to convert to audio. | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| sample_rate | `int` | Sample rate in Hz. | `44100` |
| channels | `int` | Number of audio channels (1 or 2). | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


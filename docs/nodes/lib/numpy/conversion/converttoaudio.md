---
layout: page
title: "Convert To Audio"
node_type: "lib.array.conversion.ConvertToAudio"
namespace: "lib.array.conversion"
---

**Type:** `lib.array.conversion.ConvertToAudio`

**Namespace:** `lib.array.conversion`

## Description

Converts a array object back to an audio file.
    audio, conversion, array

    Use cases:
    - Save processed audio data as a playable file
    - Convert generated or modified audio arrays to audio format
    - Output results of audio processing pipelinesr

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | The array to convert to an audio file. | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| sample_rate | `int` | The sample rate of the audio file. | `44100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.conversion](../) namespace.


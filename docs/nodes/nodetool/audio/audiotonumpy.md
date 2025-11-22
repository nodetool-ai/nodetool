---
layout: page
title: "Audio To Numpy"
node_type: "nodetool.audio.AudioToNumpy"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.AudioToNumpy`

**Namespace:** `nodetool.audio`

## Description

Convert audio to numpy array for processing.
    audio, numpy, convert, array

    Use cases:
    - Prepare audio for custom processing
    - Convert audio for machine learning models
    - Extract raw audio data for analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `audio` | The audio to convert to numpy. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| array | `np_array` |  |
| sample_rate | `int` |  |
| channels | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.


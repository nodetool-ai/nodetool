---
layout: page
title: "Audio List Input"
node_type: "nodetool.input.AudioListInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.AudioListInput`

**Namespace:** `nodetool.input`

## Description

Accepts a list of audio references as a parameter for workflows.
    input, parameter, audio, sound, voice, speech, asset, list

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `list[audio]` | The list of audio files to use as input. | `[]` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[audio]` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

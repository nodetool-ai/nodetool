---
layout: page
title: "Realtime Audio Input"
node_type: "nodetool.input.RealtimeAudioInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.RealtimeAudioInput`

**Namespace:** `nodetool.input`

## Description

Accepts streaming audio data for workflows.
    input, parameter, audio, sound, voice, speech, asset

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `audio` |
| value | `audio` | The audio to use as input. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

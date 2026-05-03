---
layout: page
title: "TTSModel Input"
node_type: "nodetool.input.TTSModelInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.TTSModelInput`

**Namespace:** `nodetool.input`

## Description

Accepts a text-to-speech model as a parameter for workflows.
    input, parameter, model, tts, speech, voice

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `tts_model` | The text-to-speech model to use as input. | `{"type":"tts_model","provider":"empty","id":"",...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `tts_model` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

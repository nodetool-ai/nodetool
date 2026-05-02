---
layout: page
title: "ASRModel Input"
node_type: "nodetool.input.ASRModelInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.ASRModelInput`

**Namespace:** `nodetool.input`

## Description

Accepts an automatic speech recognition model as a parameter for workflows.
    input, parameter, model, asr, transcription, speech

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `asr_model` | The speech recognition model to use as input. | `{"type":"asr_model","provider":"empty","id":"",...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `asr_model` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

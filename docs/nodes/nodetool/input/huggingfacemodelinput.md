---
layout: page
title: "Hugging Face Model Input"
node_type: "nodetool.input.HuggingFaceModelInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.HuggingFaceModelInput`

**Namespace:** `nodetool.input`

## Description

Accepts a Hugging Face model as a parameter for workflows.
    input, parameter, model, huggingface, hugging_face, model_name

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `hf.model` | The Hugging Face model to use as input. | `{"type":"hf.model","repo_id":"","path":null,"va...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `hf.model` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

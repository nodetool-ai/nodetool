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
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` | The Hugging Face model to use as input. | `{'type': 'hf.model', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| description | `any` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.


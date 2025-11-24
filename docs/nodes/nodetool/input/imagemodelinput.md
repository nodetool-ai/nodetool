---
layout: page
title: "Image Model Input"
node_type: "nodetool.input.ImageModelInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.ImageModelInput`

**Namespace:** `nodetool.input`

## Description

Accepts an image generation model as a parameter for workflows.
    input, parameter, model, image, generation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `image_model` | The image generation model to use as input. | `{'type': 'image_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image_model` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.


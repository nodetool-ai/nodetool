---
layout: page
title: "Image List Input"
node_type: "nodetool.input.ImageListInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.ImageListInput`

**Namespace:** `nodetool.input`

## Description

Accepts a list of image references as a parameter for workflows.
    input, parameter, image, picture, graphic, visual, asset, list

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `list[image]` | The list of images to use as input. | `[]` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[image]` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

---
layout: page
title: "Video Model Input"
node_type: "nodetool.input.VideoModelInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.VideoModelInput`

**Namespace:** `nodetool.input`

## Description

Accepts a video generation model as a parameter for workflows.
    input, parameter, model, video, generation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `video_model` | The video generation model to use as input. | `{"type":"video_model","provider":"empty","id":"...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video_model` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

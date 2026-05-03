---
layout: page
title: "Video List Input"
node_type: "nodetool.input.VideoListInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.VideoListInput`

**Namespace:** `nodetool.input`

## Description

Accepts a list of video references as a parameter for workflows.
    input, parameter, video, movie, clip, visual, asset, list

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `list[video]` | The list of videos to use as input. | `[]` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[video]` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

---
layout: page
title: "Video Output"
node_type: "nodetool.output.VideoOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.VideoOutput`

**Namespace:** `nodetool.output`

## Description

Output node for video content references ('VideoRef').
    video, media, clip, asset, reference

    Use cases:
    - Displaying processed or generated video content.
    - Passing video data (as a 'VideoRef') between workflow steps.
    - Returning results of video analysis encapsulated in a 'VideoRef'.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` |  | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| description | `any` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.


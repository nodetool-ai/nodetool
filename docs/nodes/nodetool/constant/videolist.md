---
layout: page
title: "Video List"
node_type: "nodetool.constant.VideoList"
namespace: "nodetool.constant"
---

**Type:** `nodetool.constant.VideoList`

**Namespace:** `nodetool.constant`

## Description

Represents a list of video file constants in the workflow.
    videos, movies, clips, collection

    Use cases:
    - Provide a fixed list of videos for batch processing
    - Reference multiple video files in the workflow
    - Set default video list for testing or demonstration purposes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `list[video]` | List of video references | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[video]` |  |

## Related Nodes

Browse other nodes in the [nodetool.constant](../) namespace.

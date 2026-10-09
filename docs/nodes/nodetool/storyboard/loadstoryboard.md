---
layout: page
title: "Load Storyboard"
node_type: "nodetool.storyboard.LoadStoryboard"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.LoadStoryboard`

**Namespace:** `nodetool.storyboard`

## Description

Read a persisted storyboard's shots, cast and settings.
    storyboard, board, shots, entities, load

    Use cases:
    - Feed a board's shots into a batch
    - Read the cast a board was directed with
    - Branch a workflow on a board's shot count

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| storyboard | `storyboard` | The board to read. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| storyboard | `storyboard` |  |
| shots | `list[dict]` |  |
| entities | `list[entity]` |  |
| style | `str` |  |
| aspect_ratio | `str` |  |
| name | `str` |  |
| image_model | `image_model` |  |
| video_model | `video_model` |  |
| shot_count | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.

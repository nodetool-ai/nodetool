---
layout: page
title: "Storyboard Shots"
node_type: "nodetool.storyboard.StoryboardShots"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.StoryboardShots`

**Namespace:** `nodetool.storyboard`

## Description

Fan a persisted storyboard out into one message per shot, with its rendered still and clip.
    storyboard, shots, iterate, keyframe, clip

    Use cases:
    - Driving a per-shot pipeline from an approved board
    - Collecting a board's stills or clips downstream
    - Iterating over shots without re-directing them

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| storyboard | `storyboard` | The board whose shots to stream. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| shot | `dict` |  |
| index | `int` |  |
| slug | `str` |  |
| keyframe | `image` |  |
| clip | `video` |  |
| output | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.

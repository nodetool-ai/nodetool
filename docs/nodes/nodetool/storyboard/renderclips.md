---
layout: page
title: "Render Clips"
node_type: "nodetool.storyboard.RenderClips"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.RenderClips`

**Namespace:** `nodetool.storyboard`

## Description

Animate every stale shot on a storyboard and save the clip onto the board.
    storyboard, clip, video, render, batch

    Use cases:
    - Turning approved stills into shots
    - Re-rendering only the clips a recast invalidated
    - Bounding what one run spends on video

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| storyboard | `storyboard` | The board whose clips to render. | - |
| targets | `list[str]` | Shot ids, indices or slugs to render. Empty renders every shot the gates allow. | `[]` |
| max_shots | `int` | Most shots this call renders. The rest are reported as skipped, not rendered. | `8` |
| require_keyframe | `bool` | Skip a keyframe-mode shot that has no selected still, instead of spending on a clip with nothing to animate. | `true` |
| concurrency | `int` | Renders in flight at once. | `1` |
| only_stale | `bool` | Skip a shot whose clip already matches what the board would render. | `true` |
| video_model | `video_model` | Overrides the board's clip model for this call. | - |
| allow_writes | `bool` | Render the board as it was picked, rather than only one this run derived. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| storyboard | `storyboard` |  |
| clips | `list[video]` |  |
| rendered | `list[str]` |  |
| skipped | `list[str]` |  |
| failed | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.

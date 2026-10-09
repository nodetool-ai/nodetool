---
layout: page
title: "Render Stills"
node_type: "nodetool.storyboard.RenderStills"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.RenderStills`

**Namespace:** `nodetool.storyboard`

## Description

Render the keyframe of every stale shot on a storyboard and save it onto the board.
    storyboard, keyframe, still, render, batch

    Use cases:
    - Filling a recast board's frames before the clips
    - Re-rendering only the shots a template edit changed
    - Stopping a batch at the stills to review the spend

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| storyboard | `storyboard` | The board whose stills to render. | - |
| targets | `list[str]` | Shot ids, indices or slugs to render. Empty renders every shot the gates allow. | `[]` |
| max_shots | `int` | Most shots this call renders. The rest are reported as skipped, not rendered. | `24` |
| concurrency | `int` | Renders in flight at once. | `2` |
| only_stale | `bool` | Skip a shot whose still already matches what the board would render. | `true` |
| image_model | `image_model` | Overrides the board's still model for this call. | - |
| allow_writes | `bool` | Render the board as it was picked, rather than only one this run derived. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| storyboard | `storyboard` |  |
| keyframes | `list[image]` |  |
| rendered | `list[str]` |  |
| skipped | `list[str]` |  |
| failed | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.

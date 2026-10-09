---
layout: page
title: "Assemble Timeline"
node_type: "nodetool.storyboard.AssembleTimeline"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.AssembleTimeline`

**Namespace:** `nodetool.storyboard`

## Description

Cut a storyboard's rendered shots into a timeline, inheriting the template's cut when the board is a copy.
    storyboard, timeline, assemble, cut, edit

    Use cases:
    - Turning a finished board into an editable sequence
    - Giving every recast copy the approved cut, titles and music
    - Re-cutting a board after re-rendering some shots

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| storyboard | `storyboard` | The board to cut. | - |
| name | `str` | Name for the sequence. Defaults to the board's name. | `` |
| fps | `int` | Frame rate of the assembled sequence. | `30` |
| allow_writes | `bool` | Cut the board as it was picked, rather than only one this run derived. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| timeline | `timeline` |  |
| skipped_shots | `list[str]` |  |
| retimed | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.

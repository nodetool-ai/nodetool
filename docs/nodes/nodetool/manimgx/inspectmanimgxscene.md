---
layout: page
title: "Inspect ManimGX Scene"
node_type: "nodetool.manimgx.InspectScene"
namespace: "nodetool.manimgx"
---

**Type:** `nodetool.manimgx.InspectScene`

**Namespace:** `nodetool.manimgx`

## Description

Check a ManimGX scene without rendering video: a storyboard of key frames, the timeline of plays, and 2D layout problems such as clipped content or overlapping text.
    manim, manimgx, inspect, storyboard, layout, check, preview, animation, python

    Use cases:
    - Preview a scene's key frames before a full render
    - Feed layout problems and tracebacks back to an LLM that writes the scene
    - Grab stills at chosen times

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| times | `str` | Seconds from the start, or 'end', separated by commas (e.g. 0.5,2,end). Empty samples each play's end. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| ok | `bool` |  |
| problems | `bool` |  |
| report | `str` |  |
| storyboard | `list[image]` |  |
| duration | `float` |  |

## Related Nodes

Browse other nodes in the [nodetool.manimgx](./) namespace.

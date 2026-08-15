---
layout: page
title: "Screenplay Shots"
node_type: "nodetool.creative.ScreenplayShots"
namespace: "nodetool.creative"
---

**Type:** `nodetool.creative.ScreenplayShots`

**Namespace:** `nodetool.creative`

## Description

Fan a screenplay out into one image-generation prompt per shot.
    creative, screenplay, shots, prompts, storyboard

    Use cases:
    - Turning a Director screenplay into per-shot prompts
    - Driving a keyframe generator once per shot
    - Iterating over shots in a storyboard pipeline

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| screenplay | `dict` | The screenplay to fan out into per-shot prompts. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| shot | `dict` |  |
| shot_prompt | `str` |  |
| index | `int` |  |
| output | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.creative](./) namespace.

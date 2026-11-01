---
layout: page
title: "Shot"
node_type: "nodetool.video.Shot"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Shot`

**Namespace:** `nodetool.video`

## Description

One shot of a multi-shot video, for models such as Kling 3 that take a list of shot prompts. Chain Shots through Previous to set their order, then connect the last one to the model's shot input.
    video, shot, multi-shot, sequence, prompt, kling

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| previous | `list[shot]` | The shots that play before this one. | `[]` |
| prompt | `str` | What happens in this shot. | `` |
| duration | `float` | Seconds this shot lasts. | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[shot]` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.

---
layout: page
title: "Shot Batch"
node_type: "nodetool.creative.ShotBatch"
namespace: "nodetool.creative"
---

**Type:** `nodetool.creative.ShotBatch`

**Namespace:** `nodetool.creative`

## Description

Flatten a screenplay into generation-ready shot specs (prompt, timing, keyframe).
    creative, shots, batch, screenplay, prompts

    Use cases:
    - Preparing a screenplay's shots for batch keyframe/clip generation
    - Producing one prompt + duration per shot in a single list
    - Feeding the Shot Chain node a ready-to-render spec list

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| screenplay | `dict` | The screenplay to flatten into per-shot generation specs. | `{}` |
| aspect_ratio | `str` | Aspect ratio applied to every shot spec (e.g. 16:9, 9:16, 1:1). | `16:9` |
| default_duration | `int` | Clip length in seconds for shots without their own duration. | `4` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| shots | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [nodetool.creative](./) namespace.

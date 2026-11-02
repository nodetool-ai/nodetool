---
layout: page
title: "Text To Video (Wan2GP)"
node_type: "lib.wan2gp.TextToVideo"
namespace: "lib.wan2gp"
---

**Type:** `lib.wan2gp.TextToVideo`

**Namespace:** `lib.wan2gp`

## Description

Generate a video from a prompt with a Wan video model on your own Wan2GP server.
    video, generation, text-to-video, Wan, Wan2GP, local

    Use cases:
    - Turn a written scene description into a short clip
    - Produce b-roll and background footage for an edit
    - Run prompt variations on local hardware without an API bill

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Description of the video to generate. | `` |
| model_type | `str` | Wan2GP model id, for example t2v_2_2. The List Models node shows the ids your server offers. | `t2v_2_2` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [lib.wan2gp](./) namespace.

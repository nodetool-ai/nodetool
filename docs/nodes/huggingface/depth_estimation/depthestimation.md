---
layout: page
title: "Depth Estimation"
node_type: "huggingface.depth_estimation.DepthEstimation"
namespace: "huggingface.depth_estimation"
---

**Type:** `huggingface.depth_estimation.DepthEstimation`

**Namespace:** `huggingface.depth_estimation`

## Description

Estimates depth from a single image.
    image, depth estimation, 3D, huggingface

    Use cases:
    - Generate depth maps for 3D modeling
    - Assist in augmented reality applications
    - Enhance computer vision systems for robotics
    - Improve scene understanding in autonomous vehicles

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.depth_estimation` | The model ID to use for depth estimation | `{'type': 'hf.depth_estimation', 'repo_id': 'LiheYoung/depth-anything-base-hf', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image for depth estimation | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.depth_estimation](../) namespace.


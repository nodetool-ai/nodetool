---
layout: page
title: "Levels"
node_type: "nodetool.image.Levels"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Levels`

**Namespace:** `nodetool.image`

## Description

Adjust input black point, gamma, and white point per RGB channel.
    image, levels, color, tone, curves

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to adjust. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| r_black | `int` | Red channel input black point (0–255). | `0` |
| r_gamma | `float` | Red channel gamma (0.01–10). | `1` |
| r_white | `int` | Red channel input white point (0–255). | `255` |
| g_black | `int` | Green channel input black point (0–255). | `0` |
| g_gamma | `float` | Green channel gamma (0.01–10). | `1` |
| g_white | `int` | Green channel input white point (0–255). | `255` |
| b_black | `int` | Blue channel input black point (0–255). | `0` |
| b_gamma | `float` | Blue channel gamma (0.01–10). | `1` |
| b_white | `int` | Blue channel input white point (0–255). | `255` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.

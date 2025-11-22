---
layout: page
title: "Auto Contrast"
node_type: "lib.pillow.enhance.AutoContrast"
namespace: "lib.pillow.enhance"
---

**Type:** `lib.pillow.enhance.AutoContrast`

**Namespace:** `lib.pillow.enhance`

## Description

Automatically adjusts image contrast for enhanced visual quality.
    image, contrast, balance

    Use cases:
    - Enhance image clarity for better visual perception
    - Pre-process images for computer vision tasks
    - Improve photo aesthetics in editing workflows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to adjust the contrast for. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| cutoff | `int` | Represents the percentage of pixels to ignore at both the darkest and lightest ends of the histogram. A cutoff value of 5 means ignoring the darkest 5% and the lightest 5% of pixels, enhancing overall contrast by stretching the remaining pixel values across the full brightness range. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.enhance](../) namespace.


---
layout: page
title: "Transform"
node_type: "lib.svg.Transform"
namespace: "lib.svg"
---

**Type:** `lib.svg.Transform`

**Namespace:** `lib.svg`

## Description

Apply transformations to SVG elements.
    svg, transform, animation

    Use cases:
    - Rotate, scale, or translate elements
    - Create complex transformations
    - Prepare elements for animation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| content | `svg_element` | SVG element to transform | - |
| translate_x | `float` | X translation | `0` |
| translate_y | `float` | Y translation | `0` |
| rotate | `float` | Rotation angle in degrees | `0` |
| scale_x | `float` | X scale factor | `1` |
| scale_y | `float` | Y scale factor | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.


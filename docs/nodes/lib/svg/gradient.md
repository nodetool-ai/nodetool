---
layout: page
title: "Gradient"
node_type: "lib.svg.Gradient"
namespace: "lib.svg"
---

**Type:** `lib.svg.Gradient`

**Namespace:** `lib.svg`

## Description

Create linear or radial gradients for SVG elements.
    svg, gradient, color

    Use cases:
    - Add smooth color transitions
    - Create complex color effects
    - Define reusable gradient definitions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| gradient_type | `any` | Type of gradient | `linearGradient` |
| x1 | `any` | Start X position (linear) or center X (radial) | `0` |
| y1 | `any` | Start Y position (linear) or center Y (radial) | `0` |
| x2 | `any` | End X position (linear) or radius X (radial) | `100` |
| y2 | `any` | End Y position (linear) or radius Y (radial) | `100` |
| color1 | `any` | Start color of gradient | `{'type': 'color', 'value': '#000000'}` |
| color2 | `any` | End color of gradient | `{'type': 'color', 'value': '#FFFFFF'}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.


---
layout: page
title: "Drop Shadow"
node_type: "lib.svg.DropShadow"
namespace: "lib.svg"
---

**Type:** `lib.svg.DropShadow`

**Namespace:** `lib.svg`

## Description

Apply drop shadow filter effect to SVG elements for depth.
    svg, filter, shadow, effects

    Use cases:
    - Add depth and elevation to elements
    - Create realistic shadow effects
    - Enhance visual hierarchy
    - Improve element separation and readability

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| std_deviation | `float` | Standard deviation for blur | `3` |
| dx | `int` | X offset for shadow | `2` |
| dy | `int` | Y offset for shadow | `2` |
| color | `color` | Color for shadow | `{"type":"color","value":"#000000"}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

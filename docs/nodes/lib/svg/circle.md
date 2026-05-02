---
layout: page
title: "Circle"
node_type: "lib.svg.Circle"
namespace: "lib.svg"
---

**Type:** `lib.svg.Circle`

**Namespace:** `lib.svg`

## Description

Generate SVG circle element with customizable position, radius, and styling.
    svg, shape, vector, circle

    Use cases:
    - Create circular shapes and icons
    - Design buttons, badges, and indicators
    - Build data visualizations like pie charts
    - Create decorative elements and patterns

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| cx | `int` | Center X coordinate | `0` |
| cy | `int` | Center Y coordinate | `0` |
| radius | `int` | Radius | `50` |
| fill | `color` | Fill color | `{"type":"color","value":"#000000"}` |
| stroke | `color` | Stroke color | `{"type":"color","value":"none"}` |
| stroke_width | `int` | Stroke width | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

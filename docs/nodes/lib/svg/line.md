---
layout: page
title: "Line"
node_type: "lib.svg.Line"
namespace: "lib.svg"
---

**Type:** `lib.svg.Line`

**Namespace:** `lib.svg`

## Description

Generate SVG line element with customizable endpoints and styling.
    svg, shape, vector, line

    Use cases:
    - Draw straight lines and connectors
    - Create dividers and separators
    - Build diagrams and flowcharts
    - Design grid patterns and borders

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| x1 | `int` | Start X coordinate | `0` |
| y1 | `int` | Start Y coordinate | `0` |
| x2 | `int` | End X coordinate | `100` |
| y2 | `int` | End Y coordinate | `100` |
| stroke | `color` | Stroke color | `{"type":"color","value":"#000000"}` |
| stroke_width | `int` | Stroke width | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

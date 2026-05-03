---
layout: page
title: "Rectangle"
node_type: "lib.svg.Rect"
namespace: "lib.svg"
---

**Type:** `lib.svg.Rect`

**Namespace:** `lib.svg`

## Description

Generate SVG rectangle element with customizable position, size, and styling.
    svg, shape, vector, rectangle

    Use cases:
    - Create rectangular shapes in SVG documents
    - Design borders, frames, and backgrounds
    - Build user interface components
    - Create geometric patterns and layouts

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| x | `int` | X coordinate | `0` |
| y | `int` | Y coordinate | `0` |
| width | `int` | Width | `100` |
| height | `int` | Height | `100` |
| fill | `color` | Fill color | `{"type":"color","value":"#000000"}` |
| stroke | `color` | Stroke color | `{"type":"color","value":"none"}` |
| stroke_width | `int` | Stroke width | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

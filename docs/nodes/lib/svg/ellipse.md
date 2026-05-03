---
layout: page
title: "Ellipse"
node_type: "lib.svg.Ellipse"
namespace: "lib.svg"
---

**Type:** `lib.svg.Ellipse`

**Namespace:** `lib.svg`

## Description

Generate SVG ellipse element with customizable position, radii, and styling.
    svg, shape, vector, ellipse

    Use cases:
    - Create oval shapes and organic forms
    - Design speech bubbles and callouts
    - Build data visualization elements
    - Create decorative patterns and borders

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| cx | `int` | Center X coordinate | `0` |
| cy | `int` | Center Y coordinate | `0` |
| rx | `int` | X radius | `100` |
| ry | `int` | Y radius | `50` |
| fill | `color` | Fill color | `{"type":"color","value":"#000000"}` |
| stroke | `color` | Stroke color | `{"type":"color","value":"none"}` |
| stroke_width | `int` | Stroke width | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

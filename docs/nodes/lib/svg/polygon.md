---
layout: page
title: "Polygon"
node_type: "lib.svg.Polygon"
namespace: "lib.svg"
---

**Type:** `lib.svg.Polygon`

**Namespace:** `lib.svg`

## Description

Generate SVG polygon element with multiple vertices.
    svg, shape, vector, polygon

    Use cases:
    - Create multi-sided shapes like triangles, pentagons, stars
    - Build custom icons and symbols
    - Design complex geometric patterns
    - Create irregular shapes and forms

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| points | `str` | Points in format 'x1,y1 x2,y2 x3,y3...' | `` |
| fill | `color` | Fill color | `{"type":"color","value":"#000000"}` |
| stroke | `color` | Stroke color | `{"type":"color","value":"none"}` |
| stroke_width | `int` | Stroke width | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

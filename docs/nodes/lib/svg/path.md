---
layout: page
title: "Path"
node_type: "lib.svg.Path"
namespace: "lib.svg"
---

**Type:** `lib.svg.Path`

**Namespace:** `lib.svg`

## Description

Generate SVG path element using path data commands.
    svg, shape, vector, path

    Use cases:
    - Create complex curved and custom shapes
    - Build logos and custom icons
    - Design intricate patterns and illustrations
    - Import path data from design tools

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| path_data | `str` | SVG path data (d attribute) | `` |
| fill | `color` | Fill color | `{"type":"color","value":"#000000"}` |
| stroke | `color` | Stroke color | `{"type":"color","value":"none"}` |
| stroke_width | `int` | Stroke width | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

---
layout: page
title: "Text"
node_type: "lib.svg.Text"
namespace: "lib.svg"
---

**Type:** `lib.svg.Text`

**Namespace:** `lib.svg`

## Description

Add text elements to SVG.
    svg, text, typography

    Use cases:
    - Add labels to vector graphics
    - Create text-based logos
    - Generate dynamic text content in SVGs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | Text content | `` |
| x | `int` | X coordinate | `0` |
| y | `int` | Y coordinate | `0` |
| font_family | `str` | Font family | `Arial` |
| font_size | `int` | Font size | `16` |
| fill | `color` | Text color | `{'type': 'color', 'value': '#000000'}` |
| text_anchor | `Enum['start', 'middle', 'end']` | Text anchor position | `start` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.


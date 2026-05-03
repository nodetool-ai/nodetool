---
layout: page
title: "SVG Document"
node_type: "lib.svg.Document"
namespace: "lib.svg"
---

**Type:** `lib.svg.Document`

**Namespace:** `lib.svg`

## Description

Combine SVG elements into a complete SVG document.
    svg, document, combine

    Use cases:
    - Combine multiple SVG elements into a single document
    - Set document-level properties like viewBox and dimensions
    - Export complete SVG documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| elements | `list[svg_element]` | List of SVG elements | `[]` |
| width | `int` | Document width | `800` |
| height | `int` | Document height | `600` |
| viewBox | `str` | SVG viewBox attribute | `0 0 800 600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg` |  |

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.

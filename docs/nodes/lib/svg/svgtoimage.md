---
layout: page
title: "SVG to Image"
node_type: "lib.svg.SVGToImage"
namespace: "lib.svg"
---

**Type:** `lib.svg.SVGToImage`

**Namespace:** `lib.svg`

## Description

Create an SVG document and convert it to a raster image in one step.
    svg, document, raster, convert

    Use cases:
    - Create and rasterize SVG documents in a single operation
    - Generate image files from SVG elements
    - Convert vector graphics to bitmap format with custom dimensions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| content | `(str | svg_element | List[svg_element])` | SVG content | `[]` |
| width | `int` | Document width | `800` |
| height | `int` | Document height | `600` |
| viewBox | `str` | SVG viewBox attribute | `0 0 800 600` |
| scale | `int` | Scale factor for rasterization | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.svg](../) namespace.


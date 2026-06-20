---
layout: page
title: "Vectorize Image"
node_type: "nodetool.image.Vectorize"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Vectorize`

**Namespace:** `nodetool.image`

## Description

Convert a raster image into a scalable vector (SVG) using any supported vectorization provider.
    image, vector, svg, vectorize, trace, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The vectorization model to use | `{"type":"image_model","provider":"fal_ai","id":...` |
| image | `image` | Input image to vectorize | `{"type":"image","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `svg_element` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.

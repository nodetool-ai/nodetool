---
layout: page
title: "Segment Image"
node_type: "nodetool.image.Segment"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Segment`

**Namespace:** `nodetool.image`

## Description

Find objects in an image and return one mask per object, using any supported segmentation provider.
    image, segment, mask, sam, cutout, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The segmentation model to use | `{"type":"image_model","provider":"fal_ai","id":...` |
| image | `image` | Input image to segment | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | The object to find, e.g. "the red car". Most models need this: a concept-driven model such as SAM 3.1 segments nothing without it, and ignores points and boxes. Leave it empty only for a model that finds objects on its own, such as fal-ai/sam2/auto-segment. | `` |
| points | `list[dict]` | Clicks that point at one object, in source-image pixels: {x, y, include}. `include: false` marks a point that is NOT part of it. | `[]` |
| box | `dict` | A rectangle around one object, in source-image pixels: {x, y, width, height} | `{}` |
| max_masks | `int` | Upper bound on how many masks to return | `3` |
| min_confidence | `float` | Drop masks the model scores below this (0 = keep every mask) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| masks | `list[image]` |  |
| labels | `list[str]` |  |
| scores | `list[float]` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.

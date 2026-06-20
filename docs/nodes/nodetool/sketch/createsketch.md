---
layout: page
title: "Create Sketch"
node_type: "nodetool.sketch.CreateSketch"
namespace: "nodetool.sketch"
---

**Type:** `nodetool.sketch.CreateSketch`

**Namespace:** `nodetool.sketch`

## Description

Create a new sketch document from an image, ready to edit in the sketch editor.
    sketch, create, image, editor, handoff

    Use cases:
    - Hand a generated image to the sketch editor for manual touch-up
    - Start a paint-over from a photo or render
    - Round-trip: generate, refine by hand, feed back into the workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to place on the sketch's base layer. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| name | `str` | Name of the new sketch document. | `Untitled sketch` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `sketch` |  |

## Related Nodes

Browse other nodes in the [nodetool.sketch](./) namespace.

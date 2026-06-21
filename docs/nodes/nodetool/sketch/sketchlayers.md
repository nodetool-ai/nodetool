---
layout: page
title: "Sketch Layers"
node_type: "nodetool.sketch.SketchLayers"
namespace: "nodetool.sketch"
---

**Type:** `nodetool.sketch.SketchLayers`

**Namespace:** `nodetool.sketch`

## Description

Extract each visible layer of a sketch document as a separate image.
    sketch, layers, split, extract

    Use cases:
    - Process foreground/background layers through different pipelines
    - Batch-restyle each layer of a composition independently
    - Feed named layers into compositing or animation nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| sketch | `sketch` | The sketch document to split into layer images. | `{"type":"sketch","id":null,"data":null}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| layers | `list[image]` |  |
| names | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.sketch](./) namespace.

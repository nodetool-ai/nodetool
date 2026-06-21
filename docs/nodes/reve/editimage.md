---
layout: page
title: "Edit Image"
node_type: "reve.EditImage"
namespace: "reve"
---

**Type:** `reve.EditImage`

**Namespace:** `reve`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The reference image to edit. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| edit_instruction | `str` | How to modify the image (max 2560 chars). | `` |
| aspect_ratio | `enum` | Output proportions. 'none' keeps the reference image's aspect ratio. | `none` |
| version | `enum` | Model version to use. | `latest` |
| postprocessing | `enum` | Optional postprocessing operation applied to the result. | `none` |
| test_time_scaling | `int` | Effort multiplier for quality (1-15). Higher costs more. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [reve](./) namespace.

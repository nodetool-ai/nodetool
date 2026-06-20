---
layout: page
title: "Remix Image"
node_type: "reve.RemixImage"
namespace: "reve"
---

**Type:** `reve.RemixImage`

**Namespace:** `reve`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` |  | `` |
| reference_images | `list` | 1-6 reference images to remix. | `[]` |
| aspect_ratio | `enum` | Output proportions. 'none' lets the model choose the aspect ratio. | `none` |
| version | `enum` | Model version to use. | `latest` |
| postprocessing | `enum` | Optional postprocessing operation applied to the result. | `none` |
| test_time_scaling | `int` | Effort multiplier for quality (1-15). Higher costs more. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [reve](./) namespace.

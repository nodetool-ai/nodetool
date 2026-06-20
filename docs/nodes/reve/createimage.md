---
layout: page
title: "Create Image"
node_type: "reve.CreateImage"
namespace: "reve"
---

**Type:** `reve.CreateImage`

**Namespace:** `reve`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Text description of the image to generate (max 2560 chars). | `` |
| aspect_ratio | `enum` | Proportions of the generated image. | `3:2` |
| version | `enum` | Model version to use. | `latest` |
| postprocessing | `enum` | Optional postprocessing operation applied to the result. | `none` |
| test_time_scaling | `int` | Effort multiplier for quality (1-15). Higher costs more. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [reve](./) namespace.

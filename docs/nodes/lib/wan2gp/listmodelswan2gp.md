---
layout: page
title: "List Models (Wan2GP)"
node_type: "lib.wan2gp.ListModels"
namespace: "lib.wan2gp"
---

**Type:** `lib.wan2gp.ListModels`

**Namespace:** `lib.wan2gp`

## Description

List the models your own Wan2GP server offers, with the media each one accepts.
    models, list, search, Wan, Wan2GP, local

    Each row carries the model_type for the other Wan2GP nodes, the name and family, the outputs, and media_inputs: the image, video and audio roles the model accepts and any custom file it needs. The list comes from the running server, so it includes finetunes and models added after this release.

    Use cases:
    - Find the model_type for a model you know by name
    - List the video models that take a start or reference image
    - Check which models need a custom file before you build a graph

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| server_url | `str` | MCP endpoint of your own Wan2GP server. Leave blank to use the WAN2GP_MCP_URL setting, then http://127.0.0.1:7866/mcp. | `` |
| query | `str` | Text to look for in the model's name, id, family or description. Leave blank to list every model. | `` |
| main_output | `enum` | Keep only models whose main output is this kind. Empty keeps every kind. | `` |
| media_input | `str` | Keep only models that accept this input kind: image, video, audio, 3d or world. | `` |
| capability | `str` | Keep only models with this Wan2GP capability, for example image_to_video, reference_images or control_video. | `` |
| limit | `int` | Most models to return. | `50` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [lib.wan2gp](./) namespace.

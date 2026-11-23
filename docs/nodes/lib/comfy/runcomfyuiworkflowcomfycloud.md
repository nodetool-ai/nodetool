---
layout: page
title: "Run ComfyUI Workflow (Comfy Cloud)"
node_type: "lib.comfy.RunWorkflowOnCloud"
namespace: "lib.comfy"
---

**Type:** `lib.comfy.RunWorkflowOnCloud`

**Namespace:** `lib.comfy`

## Description

Run a ComfyUI workflow on Comfy Cloud via the Comfy API v2.
    comfy, comfyui, cloud, workflow, image, diffusion

    Use cases:
    - Run a ComfyUI workflow without hosting a GPU
    - Generate images or video from an exported API-format workflow
    - Embed Comfy Cloud generation inside a NodeTool workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| workflow | `str` | ComfyUI workflow in API (prompt) format, as a JSON string: a map of node id to { class_type, inputs }. | `` |
| timeout | `int` | Maximum seconds to wait for the job to finish. | `600` |
| previews | `bool` | Log ComfyUI preview frames while the job runs. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [lib.comfy](./) namespace.

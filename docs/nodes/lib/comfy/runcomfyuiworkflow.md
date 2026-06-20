---
layout: page
title: "Run ComfyUI Workflow"
node_type: "lib.comfy.RunWorkflow"
namespace: "lib.comfy"
---

**Type:** `lib.comfy.RunWorkflow`

**Namespace:** `lib.comfy`

## Description

Run a ComfyUI workflow on a ComfyUI server.
    comfy, comfyui, workflow, image, diffusion

    Use cases:
    - Generate images with an existing ComfyUI workflow
    - Call a local or remote ComfyUI server (RunPod, etc.)
    - Embed ComfyUI generation inside a NodeTool workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| endpoint | `str` | ComfyUI server address, e.g. 127.0.0.1:8188 or http://host:8188. | `127.0.0.1:8188` |
| workflow | `str` | ComfyUI workflow in API (prompt) format, as a JSON string: a map of node id to { class_type, inputs }. | `` |
| timeout | `int` | Maximum seconds to wait for the workflow to finish. | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [lib.comfy](./) namespace.

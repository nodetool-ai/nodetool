---
layout: page
title: "Run ComfyUI Workflow (Worker)"
node_type: "lib.comfy.RunWorkflowOnWorker"
namespace: "lib.comfy"
---

**Type:** `lib.comfy.RunWorkflowOnWorker`

**Namespace:** `lib.comfy`

## Description

Run a ComfyUI workflow on a NodeTool worker (nodetool-worker-comfy) over the worker bridge.
    comfy, comfyui, workflow, worker, runpod, diffusion

    Use cases:
    - Run ComfyUI on a remote GPU worker without exposing ComfyUI directly
    - Drive a RunPod ComfyUI worker from inside a NodeTool workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| worker_url | `str` | WebSocket URL of the NodeTool worker fronting ComfyUI, e.g. ws://host:7777/ws. | `ws://127.0.0.1:7777/ws` |
| worker_token | `str` | Bearer token for the worker, if it requires authentication. | `` |
| workflow | `str` | ComfyUI workflow in API (prompt) format, as a JSON string: a map of node id to { class_type, inputs }. | `` |
| timeout | `int` | Maximum seconds to wait for the workflow to finish. | `600` |
| previews | `bool` | Stream ComfyUI preview images while the workflow runs. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [lib.comfy](./) namespace.

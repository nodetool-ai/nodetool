---
layout: page
title: "Text To Video (Wan2GP)"
node_type: "lib.wan2gp.TextToVideo"
namespace: "lib.wan2gp"
---

**Type:** `lib.wan2gp.TextToVideo`

**Namespace:** `lib.wan2gp`

## Description

Generate a video from a prompt with a Wan video model on your own Wan2GP server.
    video, generation, text-to-video, Wan, Wan2GP, local

    Use cases:
    - Turn a written scene description into a short clip
    - Produce b-roll and background footage for an edit
    - Run prompt variations on local hardware without an API bill

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| server_url | `str` | MCP endpoint of a Wan2GP server, for example http://127.0.0.1:7866/mcp. Leave blank to use the WAN2GP_MCP_URL setting, then the Wan2GP installed in the Package Manager, then localhost. | `` |
| timeout_seconds | `int` | How long to wait for one generation, in seconds. The job is cancelled on the server when it runs out. | `1800` |
| max_media_bytes | `int` | Largest upload or download in bytes. Defaults to 512 MiB, at most 8 GiB. | - |
| seed | `int` | Random seed. Use -1 to let Wan2GP pick a new seed for every run. | `-1` |
| negative_prompt | `str` | What to keep out of the video. Leave empty to use the model default. | `` |
| width | `int` | Output width in pixels. Must be a multiple of 16. | `832` |
| height | `int` | Output height in pixels. Must be a multiple of 16. | `480` |
| num_frames | `int` | Number of frames. Wan2GP rounds this to the nearest count the model allows. | `81` |
| fps | `int` | Frames per second of the output video. | `16` |
| num_inference_steps | `int` | Denoising steps. More steps give more detail and take longer. | `30` |
| loras | `list[str]` | LoRA identifiers to activate, as the server lists them. | `[]` |
| lora_multipliers | `list[float]` | Weight for each LoRA, in the same order. Leave empty for a weight of 1 each. | `[]` |
| prompt | `str` | Description of the video to generate. | `` |
| model_type | `str` | Wan2GP model id, for example t2v_2_2. The List Models node shows the ids your server offers. | `t2v_2_2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [lib.wan2gp](./) namespace.

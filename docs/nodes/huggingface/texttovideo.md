---
layout: page
title: "Text to Video"
node_type: "huggingface.TextToVideo"
namespace: "huggingface"
---

**Type:** `huggingface.TextToVideo`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Text-to-video model repo id. | `Wan-AI/Wan2.2-T2V-A14B` |
| prompt | `str` | The text prompt describing the video. | `` |
| negative_prompt | `str` | What the video should NOT contain. | `` |
| num_frames | `int` | Number of frames to generate (0 = model default). | `0` |
| guidance_scale | `float` | How closely to follow the prompt (0 = model default). | `0` |
| num_inference_steps | `int` | Number of denoising steps (0 = model default). | `0` |
| seed | `int` | Random seed (-1 = random). | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.

---
layout: page
title: "Generate (Wan2GP)"
node_type: "lib.wan2gp.Generate"
namespace: "lib.wan2gp"
---

**Type:** `lib.wan2gp.Generate`

**Namespace:** `lib.wan2gp`

## Description

Run any model on your own Wan2GP server with the settings you supply, and return its image, video, audio or 3D model.
    generation, video, image, audio, 3d, Wan, Wan2GP, advanced, local

    The node starts from the model's own defaults and applies your settings on top. Each connected media input is uploaded and sent under the Wan2GP setting its description names. Wan2GP turns on the matching start, end, reference and audio modes itself. Control and mask videos also need a video_prompt_type in settings, such as "VA", unless the model's defaults enable them.

    Use cases:
    - Drive a model the other Wan2GP nodes do not cover
    - Set guidance, flow shift, sliding windows or other expert settings
    - Run a control-guided or video-to-video generation
    - Feed a model its extra input file, such as a trajectory or a score

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model_type | `str` | Wan2GP model id. The List Models node shows the ids your server offers. | `t2v_2_2` |
| settings | `dict[str, any]` | Wan2GP generation settings applied on top of the model defaults, such as prompt, resolution, video_length, num_inference_steps and guidance_scale. The reserved _api key is removed. | `{}` |
| image | `image` | Sent as image_start. | null |
| image_end | `image` | Sent as image_end, for models that take a last frame. | null |
| reference_images | `list[image]` | Sent in order as image_refs, for models that take a subject, style or background reference. | `[]` |
| video | `video` | Sent as video_guide. | null |
| video_mask | `video` | Sent as video_mask. Needs a control video and a video_prompt_type with A. | null |
| source_video | `video` | Sent as video_source, the video to continue from. | null |
| audio | `audio` | Sent as audio_guide, such as speech for lip sync. | null |
| custom_file | `asset` | Sent as custom_guide: the extra input file some models require, such as a trajectory (.npy) for wanmove or a score (.abc) for yue2. | null |
| custom_file_name | `str` | File name of the custom file with its extension, for example trajectory.npy. Leave blank to take it from the file's URI. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `union[image, video, audio, model_3d]` |  |

## Related Nodes

Browse other nodes in the [lib.wan2gp](./) namespace.

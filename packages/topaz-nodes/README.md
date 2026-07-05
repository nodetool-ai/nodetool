# @nodetool-ai/topaz-nodes

Topaz Labs image and video enhancement nodes for [NodeTool](https://nodetool.ai).

Run the [Topaz Labs](https://www.topazlabs.com) API inside NodeTool workflows: upscale, sharpen, denoise, restore, and matte images, plus enhance and frame-interpolate video.

## Install

```bash
npm install @nodetool-ai/topaz-nodes
```

## Nodes

| Node | Type | Description |
| --- | --- | --- |
| Topaz Enhance Image | `topaz.image.EnhanceImage` | Precision upscale and enhance with Topaz models. |
| Topaz Enhance Image (Generative) | `topaz.image.EnhanceImageGenerative` | Generative upscale and enhance. |
| Topaz Sharpen Image | `topaz.image.SharpenImage` | Sharpen and deblur. |
| Topaz Sharpen Image (Generative) | `topaz.image.SharpenImageGenerative` | Generative sharpen. |
| Topaz Denoise Image | `topaz.image.DenoiseImage` | Remove noise. |
| Topaz Denoise Image (Generative) | `topaz.image.DenoiseImageGenerative` | Generative denoise. |
| Topaz Adjust Lighting | `topaz.image.AdjustLighting` | Adjust image lighting. |
| Topaz Restore Image | `topaz.image.RestoreImage` | Restore degraded images. |
| Topaz Matte Image | `topaz.image.MatteImage` | Generate a subject matte. |
| Topaz Enhance Video | `topaz.video.EnhanceVideo` | Upscale and enhance video. |
| Topaz Interpolate Video | `topaz.video.InterpolateVideo` | Interpolate frames for higher frame rate. |

## Configuration

Set `TOPAZ_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

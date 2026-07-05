# @nodetool-ai/atlascloud-nodes

AtlasCloud.ai nodes for [NodeTool](https://nodetool.ai).

Run [AtlasCloud](https://atlascloud.ai) models inside NodeTool workflows: ByteDance Seedance 2.0 video generation (text-to-video, image-to-video, reference-to-video) with native audio, plus GPT Image 2, Nano Banana 2, and Nano Banana Pro image generation and editing.

## Install

```bash
npm install @nodetool-ai/atlascloud-nodes
```

## Nodes

| Node | Type | Description |
| --- | --- | --- |
| Seedance 2.0 — Text to Video | `atlascloud.video.Seedance2TextToVideo` | Generate video from text with native audio. |
| Seedance 2.0 — Image to Video | `atlascloud.video.Seedance2ImageToVideo` | Animate a still image into video. |
| Seedance 2.0 — Reference to Video | `atlascloud.video.Seedance2ReferenceToVideo` | Generate video from reference frames. |
| Seedance 2.0 Fast — Text to Video | `atlascloud.video.Seedance2FastTextToVideo` | Faster text-to-video. |
| Seedance 2.0 Fast — Image to Video | `atlascloud.video.Seedance2FastImageToVideo` | Faster image-to-video. |
| Seedance 2.0 Fast — Reference to Video | `atlascloud.video.Seedance2FastReferenceToVideo` | Faster reference-to-video. |
| GPT Image 2 — Text to Image | `atlascloud.image.GPTImage2TextToImage` | Generate images from text. |
| GPT Image 2 — Edit | `atlascloud.image.GPTImage2Edit` | Edit an image from a prompt. |
| Nano Banana 2 — Text to Image | `atlascloud.image.NanoBanana2TextToImage` | Generate images from text. |
| Nano Banana 2 — Edit | `atlascloud.image.NanoBanana2Edit` | Edit an image from a prompt. |
| Nano Banana Pro — Text to Image | `atlascloud.image.NanoBananaProTextToImage` | Generate images from text. |
| Nano Banana Pro — Edit | `atlascloud.image.NanoBananaProEdit` | Edit an image from a prompt. |
| Nano Banana Pro — Text to Image (Ultra) | `atlascloud.image.NanoBananaProTextToImageUltra` | Higher-quality text-to-image. |
| Nano Banana Pro — Edit (Ultra) | `atlascloud.image.NanoBananaProEditUltra` | Higher-quality image edit. |

## Configuration

Set `ATLASCLOUD_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

# @nodetool-ai/minimax-nodes

MiniMax AI nodes for [NodeTool](https://nodetool.ai).

These nodes build [MiniMax API](https://platform.minimax.io/docs/api-reference/api-overview)
requests themselves so they can expose MiniMax-specific controls that the
generic provider nodes don't carry. They send them through the runtime
`MinimaxProvider` (`context.callProviderEndpoint`), which holds the API key and
records each call as a generation.

## Nodes

| Node | Type | Description |
| --- | --- | --- |
| MiniMax Voice | `minimax.Voice` | Pick a MiniMax system voice and output its voice ID. |
| MiniMax Text to Speech | `minimax.TextToSpeech` | Synthesize speech with emotion, volume, pitch, speed, and language boost. |
| MiniMax Music Generation | `minimax.MusicGeneration` | Generate a full song with vocals from a style prompt and lyrics. |
| MiniMax Text to Image | `minimax.TextToImage` | Generate images with image-01 or H3 at a chosen aspect ratio. |
| MiniMax Text to Video | `minimax.TextToVideo` | Generate video from text with Hailuo / Director models. |
| MiniMax Image to Video | `minimax.ImageToVideo` | Animate a still image into a video. |

## Configuration

Set `MINIMAX_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an
environment variable. Node code never reads the key.

For text-to-image, select `MiniMax-H3-Image` or `MiniMax-H3-Image-Highspeed` to
use H3. Set `MINIMAX_REGION` to `china` for a key from the mainland platform.
It moves every MiniMax request, H3 included, to `api.minimax.cn`. The default is
`international`. `MINIMAX_IMAGE_REGION`, when set, overrides the host for H3
image requests only.

> MiniMax chat models and the generic Text to Image / Text to Video / Text to
> Speech nodes also work through the built-in MiniMax provider; this pack adds
> dedicated, discoverable nodes with the full set of MiniMax options.

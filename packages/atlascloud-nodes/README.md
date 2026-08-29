# @nodetool-ai/atlascloud-nodes

AtlasCloud.ai nodes for [NodeTool](https://nodetool.ai).

Run [AtlasCloud](https://www.atlascloud.ai) image and video models inside NodeTool
workflows — GPT Image, Nano Banana, Seedream, FLUX, Qwen Image, Ideogram, Reve,
HiDream, Krea, Youchuan and Wan for images; Seedance, Veo, Kling, Wan, MiniMax,
Vidu, PixVerse, LTX, HappyHorse and Grok Imagine for video; plus upscalers,
photo cleanup and lip-sync as prompt-free utility nodes.

Node fields are generated from AtlasCloud's published model schemas. Re-sync them
with `node scripts/sync-atlascloud-manifest.mjs` (or `--check` to detect drift).

AtlasCloud's chat models are not nodes — they come through the `atlascloud`
model provider, so they show up in the regular LLM model picker.

## Install

```bash
npm install @nodetool-ai/atlascloud-nodes
```

## Nodes

| Node | Type |
| --- | --- |
| Cosmos 3 Super — Text to Image | `atlascloud.image.Cosmos3SuperTextToImage` |
| FLUX.1 Dev | `atlascloud.image.FluxDev` |
| FLUX.1 Kontext Dev | `atlascloud.image.FluxKontextDev` |
| FLUX.1 Schnell | `atlascloud.image.FluxSchnell` |
| FLUX.2 Flex — Edit | `atlascloud.image.Flux2FlexEdit` |
| FLUX.2 Flex — Text to Image | `atlascloud.image.Flux2FlexTextToImage` |
| FLUX.2 Pro — Edit | `atlascloud.image.Flux2ProEdit` |
| FLUX.2 Pro — Text to Image | `atlascloud.image.Flux2ProTextToImage` |
| GPT Image 1 — Edit | `atlascloud.image.GPTImage1Edit` |
| GPT Image 1 — Text to Image | `atlascloud.image.GPTImage1TextToImage` |
| GPT Image 1 Mini — Edit | `atlascloud.image.GPTImage1MiniEdit` |
| GPT Image 1 Mini — Text to Image | `atlascloud.image.GPTImage1MiniTextToImage` |
| GPT Image 1.5 — Edit | `atlascloud.image.GPTImage15Edit` |
| GPT Image 1.5 — Text to Image | `atlascloud.image.GPTImage15TextToImage` |
| GPT Image 2 — Edit | `atlascloud.image.GPTImage2Edit` |
| GPT Image 2 — Text to Image | `atlascloud.image.GPTImage2TextToImage` |
| Grok Imagine Image — Edit | `atlascloud.image.GrokImagineImageEdit` |
| Grok Imagine Image — Text to Image | `atlascloud.image.GrokImagineImageTextToImage` |
| Grok Imagine Image 2.0 — Edit | `atlascloud.image.GrokImagineImage2Edit` |
| Grok Imagine Image 2.0 — Text to Image | `atlascloud.image.GrokImagineImage2TextToImage` |
| Grok Imagine Image Quality — Edit | `atlascloud.image.GrokImagineImageQualityEdit` |
| Grok Imagine Image Quality — Text to Image | `atlascloud.image.GrokImagineImageQualityTextToImage` |
| HiDream O1 1.5 — Edit | `atlascloud.image.HiDreamO115Edit` |
| HiDream O1 1.5 — Text to Image | `atlascloud.image.HiDreamO115TextToImage` |
| Ideogram v4 Quality — Text to Image | `atlascloud.image.IdeogramV4QualityTextToImage` |
| Ideogram v4 Turbo — Text to Image | `atlascloud.image.IdeogramV4TurboTextToImage` |
| Image Upscaler | `atlascloud.image.ImageUpscaler` |
| Krea 2 Turbo — Text to Image | `atlascloud.image.Krea2TurboTextToImage` |
| MAI Image 2.5 — Edit | `atlascloud.image.MaiImage25Edit` |
| MAI Image 2.5 — Text to Image | `atlascloud.image.MaiImage25TextToImage` |
| MAI Image 2.5 Flash — Edit | `atlascloud.image.MaiImage25FlashEdit` |
| MAI Image 2.5 Flash — Text to Image | `atlascloud.image.MaiImage25FlashTextToImage` |
| Nano Banana 2 — Edit | `atlascloud.image.NanoBanana2Edit` |
| Nano Banana 2 — Text to Image | `atlascloud.image.NanoBanana2TextToImage` |
| Nano Banana 2 Lite — Edit | `atlascloud.image.NanoBanana2LiteEdit` |
| Nano Banana 2 Lite — Text to Image | `atlascloud.image.NanoBanana2LiteTextToImage` |
| Nano Banana Pro — Edit | `atlascloud.image.NanoBananaProEdit` |
| Nano Banana Pro — Edit (Ultra) | `atlascloud.image.NanoBananaProEditUltra` |
| Nano Banana Pro — Text to Image | `atlascloud.image.NanoBananaProTextToImage` |
| Nano Banana Pro — Text to Image (Ultra) | `atlascloud.image.NanoBananaProTextToImageUltra` |
| Photo Cleanup | `atlascloud.image.PhotoCleanup` |
| Qwen Image 2.0 — Edit | `atlascloud.image.QwenImage2Edit` |
| Qwen Image 2.0 — Text to Image | `atlascloud.image.QwenImage2TextToImage` |
| Qwen Image 2.0 Pro — Edit | `atlascloud.image.QwenImage2ProEdit` |
| Qwen Image 2.0 Pro — Text to Image | `atlascloud.image.QwenImage2ProTextToImage` |
| Qwen Image 3.0 — Edit | `atlascloud.image.QwenImage3Edit` |
| Qwen Image 3.0 — Text to Image | `atlascloud.image.QwenImage3TextToImage` |
| Qwen Image 3.0 Pro — Edit | `atlascloud.image.QwenImage3ProEdit` |
| Qwen Image 3.0 Pro — Text to Image | `atlascloud.image.QwenImage3ProTextToImage` |
| Reve 2.1 — Edit | `atlascloud.image.Reve21Edit` |
| Reve 2.1 — Remix | `atlascloud.image.Reve21Remix` |
| Reve 2.1 — Text to Image | `atlascloud.image.Reve21TextToImage` |
| Seedream v4.5 — Edit | `atlascloud.image.SeedreamV45Edit` |
| Seedream v4.5 — Text to Image | `atlascloud.image.SeedreamV45TextToImage` |
| Seedream v5.0 Lite — Edit | `atlascloud.image.SeedreamV5LiteEdit` |
| Seedream v5.0 Lite — Text to Image | `atlascloud.image.SeedreamV5LiteTextToImage` |
| Seedream v5.0 Pro — Edit | `atlascloud.image.SeedreamV5ProEdit` |
| Seedream v5.0 Pro — Text to Image | `atlascloud.image.SeedreamV5ProTextToImage` |
| Tencent Image Upscaler | `atlascloud.image.TencentImageUpscaler` |
| Wan 2.6 — Image Edit | `atlascloud.image.Wan26ImageEdit` |
| Wan 2.6 — Text to Image | `atlascloud.image.Wan26TextToImage` |
| Wan 2.7 — Image Edit | `atlascloud.image.Wan27ImageEdit` |
| Wan 2.7 — Text to Image | `atlascloud.image.Wan27TextToImage` |
| Wan 2.7 Pro — Image Edit | `atlascloud.image.Wan27ProImageEdit` |
| Wan 2.7 Pro — Text to Image | `atlascloud.image.Wan27ProTextToImage` |
| Youchuan v8.1 — Blend | `atlascloud.image.YouchuanV81Blend` |
| Youchuan v8.1 — Image to Image | `atlascloud.image.YouchuanV81ImageToImage` |
| Youchuan v8.1 — Remove Background | `atlascloud.image.YouchuanV81RemoveBackground` |
| Youchuan v8.1 — Style Transfer | `atlascloud.image.YouchuanV81StyleTransfer` |
| Youchuan v8.1 — Text to Image | `atlascloud.image.YouchuanV81TextToImage` |
| Youchuan v8.2 — Blend | `atlascloud.image.YouchuanV82Blend` |
| Youchuan v8.2 — Image to Image | `atlascloud.image.YouchuanV82ImageToImage` |
| Youchuan v8.2 — Remove Background | `atlascloud.image.YouchuanV82RemoveBackground` |
| Youchuan v8.2 — Style Transfer | `atlascloud.image.YouchuanV82StyleTransfer` |
| Youchuan v8.2 — Text to Image | `atlascloud.image.YouchuanV82TextToImage` |
| Z-Image Turbo — Text to Image | `atlascloud.image.ZImageTurboTextToImage` |
| Avatar Omni Human 1.5 — Audio to Video | `atlascloud.video.AvatarOmniHuman15` |
| Cosmos 3 Super — Image to Video | `atlascloud.video.Cosmos3SuperImageToVideo` |
| Gemini Omni Flash — Image to Video | `atlascloud.video.GeminiOmniFlashImageToVideo` |
| Gemini Omni Flash — Reference to Video | `atlascloud.video.GeminiOmniFlashReferenceToVideo` |
| Gemini Omni Flash — Text to Video | `atlascloud.video.GeminiOmniFlashTextToVideo` |
| Gemini Omni Flash — Video Edit | `atlascloud.video.GeminiOmniFlashVideoEdit` |
| Grok Imagine Video v1.5 — Image to Video | `atlascloud.video.GrokImagineVideo15ImageToVideo` |
| Grok Imagine Video v1.5 — Reference to Video | `atlascloud.video.GrokImagineVideo15ReferenceToVideo` |
| Grok Imagine Video v1.5 — Text to Video | `atlascloud.video.GrokImagineVideo15TextToVideo` |
| Hailuo 2.3 Pro — Image to Video | `atlascloud.video.Hailuo23ProImageToVideo` |
| Hailuo 2.3 Pro — Text to Video | `atlascloud.video.Hailuo23ProTextToVideo` |
| HappyHorse 1.1 — Image to Video | `atlascloud.video.HappyHorse11ImageToVideo` |
| HappyHorse 1.1 — Reference to Video | `atlascloud.video.HappyHorse11ReferenceToVideo` |
| HappyHorse 1.1 — Text to Video | `atlascloud.video.HappyHorse11TextToVideo` |
| Kling v2.6 Pro — Image to Video | `atlascloud.video.KlingV26ProImageToVideo` |
| Kling v2.6 Pro — Text to Video | `atlascloud.video.KlingV26ProTextToVideo` |
| Kling v3.0 4K — Image to Video | `atlascloud.video.KlingV34kImageToVideo` |
| Kling v3.0 4K — Text to Video | `atlascloud.video.KlingV34kTextToVideo` |
| Kling v3.0 Pro — Image to Video | `atlascloud.video.KlingV3ProImageToVideo` |
| Kling v3.0 Pro — Text to Video | `atlascloud.video.KlingV3ProTextToVideo` |
| Kling v3.0 Std — Image to Video | `atlascloud.video.KlingV3StdImageToVideo` |
| Kling v3.0 Std — Text to Video | `atlascloud.video.KlingV3StdTextToVideo` |
| Kling v3.0 Turbo — Image to Video | `atlascloud.video.KlingV3TurboImageToVideo` |
| Kling v3.0 Turbo — Text to Video | `atlascloud.video.KlingV3TurboTextToVideo` |
| Kling Video O3 4K — Image to Video | `atlascloud.video.KlingVideoO34kImageToVideo` |
| Kling Video O3 4K — Text to Video | `atlascloud.video.KlingVideoO34kTextToVideo` |
| Kling Video O3 Pro — Image to Video | `atlascloud.video.KlingVideoO3ProImageToVideo` |
| Kling Video O3 Pro — Reference to Video | `atlascloud.video.KlingVideoO3ProReferenceToVideo` |
| Kling Video O3 Pro — Text to Video | `atlascloud.video.KlingVideoO3ProTextToVideo` |
| Kling Video O3 Std — Image to Video | `atlascloud.video.KlingVideoO3StdImageToVideo` |
| Kling Video O3 Std — Reference to Video | `atlascloud.video.KlingVideoO3StdReferenceToVideo` |
| Kling Video O3 Std — Text to Video | `atlascloud.video.KlingVideoO3StdTextToVideo` |
| LTX 2.3 Quality — Image to Video | `atlascloud.video.Ltx23QualityImageToVideo` |
| LTX 2.3 Quality — Text to Video | `atlascloud.video.Ltx23QualityTextToVideo` |
| MiniMax H3 — Image to Video | `atlascloud.video.MinimaxH3ImageToVideo` |
| MiniMax H3 — Reference to Video | `atlascloud.video.MinimaxH3ReferenceToVideo` |
| MiniMax H3 — Text to Video | `atlascloud.video.MinimaxH3TextToVideo` |
| PixVerse v6 — Image to Video | `atlascloud.video.PixverseV6ImageToVideo` |
| PixVerse v6 — Text to Video | `atlascloud.video.PixverseV6TextToVideo` |
| Seedance 2.0 — Image to Video | `atlascloud.video.Seedance2ImageToVideo` |
| Seedance 2.0 — Reference to Video | `atlascloud.video.Seedance2ReferenceToVideo` |
| Seedance 2.0 — Text to Video | `atlascloud.video.Seedance2TextToVideo` |
| Seedance 2.0 Fast — Image to Video | `atlascloud.video.Seedance2FastImageToVideo` |
| Seedance 2.0 Fast — Reference to Video | `atlascloud.video.Seedance2FastReferenceToVideo` |
| Seedance 2.0 Fast — Text to Video | `atlascloud.video.Seedance2FastTextToVideo` |
| Seedance 2.0 Mini — Image to Video | `atlascloud.video.Seedance2MiniImageToVideo` |
| Seedance 2.0 Mini — Reference to Video | `atlascloud.video.Seedance2MiniReferenceToVideo` |
| Seedance 2.0 Mini — Text to Video | `atlascloud.video.Seedance2MiniTextToVideo` |
| Seedance 2.5 — Image to Video | `atlascloud.video.Seedance25ImageToVideo` |
| Seedance 2.5 — Reference to Video | `atlascloud.video.Seedance25ReferenceToVideo` |
| Seedance 2.5 — Text to Video | `atlascloud.video.Seedance25TextToVideo` |
| Seedance v1.5 Pro — Image to Video | `atlascloud.video.SeedanceV15ProImageToVideo` |
| Seedance v1.5 Pro — Text to Video | `atlascloud.video.SeedanceV15ProTextToVideo` |
| Sync Lipsync v3 | `atlascloud.video.SyncLipsyncV3` |
| VEED Lipsync | `atlascloud.video.VeedLipsync` |
| Veo 3.1 — Image to Video | `atlascloud.video.Veo31ImageToVideo` |
| Veo 3.1 — Reference to Video | `atlascloud.video.Veo31ReferenceToVideo` |
| Veo 3.1 — Text to Video | `atlascloud.video.Veo31TextToVideo` |
| Veo 3.1 Fast — Image to Video | `atlascloud.video.Veo31FastImageToVideo` |
| Veo 3.1 Fast — Text to Video | `atlascloud.video.Veo31FastTextToVideo` |
| Veo 3.1 Lite — Image to Video | `atlascloud.video.Veo31LiteImageToVideo` |
| Veo 3.1 Lite — Start and End Frame to Video | `atlascloud.video.Veo31LiteStartEndFrameToVideo` |
| Veo 3.1 Lite — Text to Video | `atlascloud.video.Veo31LiteTextToVideo` |
| Video Upscaler | `atlascloud.video.VideoUpscaler` |
| Vidu Q3 — Reference to Video | `atlascloud.video.ViduQ3ReferenceToVideo` |
| Vidu Q3 Pro — Image to Video | `atlascloud.video.ViduQ3ProImageToVideo` |
| Vidu Q3 Pro — Text to Video | `atlascloud.video.ViduQ3ProTextToVideo` |
| Wan 2.6 — Image to Video | `atlascloud.video.Wan26ImageToVideo` |
| Wan 2.6 — Text to Video | `atlascloud.video.Wan26TextToVideo` |
| Wan 2.7 — Image to Video | `atlascloud.video.Wan27ImageToVideo` |
| Wan 2.7 — Reference to Video | `atlascloud.video.Wan27ReferenceToVideo` |
| Wan 2.7 — Text to Video | `atlascloud.video.Wan27TextToVideo` |
| Wan 2.7 — Video Edit | `atlascloud.video.Wan27VideoEdit` |
| Wan 3.0 — Image to Video | `atlascloud.video.Wan30ImageToVideo` |
| Wan 3.0 — Reference to Video | `atlascloud.video.Wan30ReferenceToVideo` |
| Wan 3.0 — Text to Video | `atlascloud.video.Wan30TextToVideo` |
| Wan 3.0 Prime — Image to Video | `atlascloud.video.Wan30PrimeImageToVideo` |
| Wan 3.0 Prime — Reference to Video | `atlascloud.video.Wan30PrimeReferenceToVideo` |
| Wan 3.0 Prime — Text to Video | `atlascloud.video.Wan30PrimeTextToVideo` |
| Youchuan v8.1 — Image to Video | `atlascloud.video.YouchuanV81ImageToVideo` |
| Youchuan v8.2 — Image to Video | `atlascloud.video.YouchuanV82ImageToVideo` |

## Configuration

Set `ATLASCLOUD_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [AtlasCloud docs](https://www.atlascloud.ai/docs/get-started)
- [GitHub](https://github.com/nodetool-ai/nodetool)

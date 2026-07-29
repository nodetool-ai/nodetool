# @nodetool-ai/replicate-nodes

Replicate model nodes for [NodeTool](https://nodetool.ai).

Run [Replicate](https://replicate.com) models inside NodeTool workflows: image generation and upscaling, video generation, text generation, speech and transcription, embeddings, background removal, face processing, and OCR. The pack generates every node from a bundled manifest, so it tracks the Replicate model catalog.

## Install

```bash
npm install @nodetool-ai/replicate-nodes
```

## Nodes

Over 400 nodes, one per Replicate model, named `replicate.<category>.<Model>`.

| Category | Node type prefix | Example |
| --- | --- | --- |
| Image generation | `replicate.image.generate.*` | `replicate.image.generate.AdInpaint` |
| Image upscaling | `replicate.image.upscale.*` | `replicate.image.upscale.RealEsrGan` |
| Image enhancement | `replicate.image.enhance.*` | `replicate.image.enhance.CodeFormer` |
| Image analysis | `replicate.image.analyze.*` | `replicate.image.analyze.SDXLClipInterrogator` |
| Background removal | `replicate.image.background.*` | — |
| Video generation | `replicate.video.generate.*` | — |
| Video face swap | `replicate.video.face.*` | — |
| Text generation | `replicate.text.generate.*` | — |
| Speech / audio | `replicate.audio.speech.*` | — |
| Transcription | `replicate.audio.transcribe.*` | — |
| Embeddings | `replicate.embedding.*` | — |

Also covers image-to-3D, OCR, face-to-many, and audio generation.

## Configuration

Set `REPLICATE_API_TOKEN` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

# @nodetool-ai/kie-nodes

Kie.ai model nodes for [NodeTool](https://nodetool.ai).

Run [Kie.ai](https://kie.ai) models inside NodeTool workflows: text-to-image and image editing, text-to-video and image-to-video, and audio generation including Suno music. The pack generates every node from a bundled manifest, so it tracks the Kie.ai model catalog.

## Install

```bash
npm install @nodetool-ai/kie-nodes
```

## Nodes

Over 120 nodes, one per Kie.ai model, named `kie.<category>.<Model>`.

| Category | Node type prefix | Example |
| --- | --- | --- |
| Image | `kie.image.*` | `kie.image.BytedanceSeedream` |
| Video | `kie.video.*` | `kie.video.GrokImagineTextToVideo` |
| Audio | `kie.audio.*` | `kie.audio.ElevenlabsAudioIsolation` |

Includes Seedream, Grok Imagine, Veo, Runway, and Suno music nodes.

## Configuration

Set `KIE_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

# @nodetool-ai/fal-nodes

FAL AI nodes for [NodeTool](https://nodetool.ai).

Run [fal.ai](https://fal.ai) models inside NodeTool workflows: FLUX and other text-to-image and image-to-image models, text-to-video and image-to-video, text-to-speech, speech-to-text, audio generation, and image-to-3D. The pack generates every node from a bundled manifest, so it tracks the fal.ai endpoint catalog.

## Install

```bash
npm install @nodetool-ai/fal-nodes
```

## Nodes

Over 1,000 nodes, one per fal.ai endpoint, named `fal.<category>.<Model>`.

| Category | Node type prefix | Example |
| --- | --- | --- |
| Text to image | `fal.text_to_image.*` | `fal.text_to_image.FluxDev` |
| Image to image | `fal.image_to_image.*` | `fal.image_to_image.FluxSchnellRedux` |
| Text to video | `fal.text_to_video.*` | `fal.text_to_video.HunyuanVideo` |
| Image to video | `fal.image_to_video.*` | `fal.image_to_video.PixverseV56ImageToVideo` |
| Video to video | `fal.video_to_video.*` | `fal.video_to_video.AMTInterpolation` |
| Text to audio | `fal.text_to_audio.*` | `fal.text_to_audio.ACEStepPromptToAudio` |
| Text to speech | `fal.text_to_speech.*` | `fal.text_to_speech.Qwen3TtsTextToSpeech17B` |
| Speech to text | `fal.speech_to_text.*` | `fal.speech_to_text.ElevenLabsSpeechToText` |
| Vision | `fal.vision.*` | `fal.vision.ArbiterImageText` |
| Image to 3D | `fal.image_to_3d.*` | `fal.image_to_3d.Trellis2` |
| Training | `fal.training.*` | `fal.training.ZImageBaseTrainer` |

Remaining categories: `audio_to_audio`, `audio_to_video`, `video_to_audio`, `video_to_text`, `text_to_3d`, `3d_to_3d`, `llm`, `text_to_json`, and more.

## Configuration

Set `FAL_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an environment variable.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

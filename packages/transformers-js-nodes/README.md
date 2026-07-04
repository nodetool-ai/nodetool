# @nodetool-ai/transformers-js-nodes

Hugging Face Transformers.js nodes for [NodeTool](https://nodetool.ai).

Run NLP, vision, and audio models locally in visual AI workflows via
Transformers.js and ONNX Runtime — no API keys, no cloud. Models download from
the Hugging Face Hub on first use and are cached on disk.

## Install

```bash
npm install @nodetool-ai/transformers-js-nodes
```

## Nodes

All node types are under the `transformers.*` namespace.

**Text** — `TextClassification`, `TokenClassification`, `QuestionAnswering`,
`Summarization`, `Translation`, `TextGeneration`, `FillMask`,
`FeatureExtraction`, `ZeroShotClassification`.

**Vision** — `ImageClassification`, `ObjectDetection`, `ImageToText`,
`ZeroShotImageClassification`.

**Audio** — `AutomaticSpeechRecognition`, `AudioClassification`,
`TextToSpeech`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

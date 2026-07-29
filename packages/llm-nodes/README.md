# @nodetool-ai/llm-nodes

LLM provider and agent nodes for [NodeTool](https://nodetool.ai).

Call OpenAI, Google Gemini, Mistral, and xAI directly from visual AI workflows —
chat, embeddings, image generation, speech, transcription, web search — plus
NodeTool agent nodes for summarizing, extracting, classifying, and generating
structured output.

## Install

```bash
npm install @nodetool-ai/llm-nodes
```

## Nodes

**OpenAI** (`openai.*`) — `text.Embedding`, `text.WebSearch`, `text.Moderation`,
`image.CreateImage`, `image.EditImage`, `image.ImageVariation`,
`audio.TextToSpeech`, `audio.Transcribe`, `audio.Translate`,
`agents.RealtimeAgent`, `agents.RealtimeTranscription`.

**Gemini** (`gemini.*`) — `text.GroundedSearch`, `text.Embedding`,
`image.ImageGeneration`, `video.TextToVideo`, `video.ImageToVideo`,
`audio.TextToSpeech`, `audio.Transcribe`.

**Mistral** (`mistral.*`) — `text.ChatComplete`, `text.CodeComplete`,
`embeddings.Embedding`, `vision.ImageToText`, `vision.OCR`.

**xAI** (`xai.*`) — `text.ChatComplete`, `text.WebSearch`, `vision.ImageToText`,
`image.GenerateImage`.

**Agents** (`nodetool.agents.*`) — `Summarizer`, `Extractor`, `Classifier`,
`EnhancePrompt`, `CreateThread`.

**Generators** (`nodetool.generators.*`) — `StructuredOutputGenerator`,
`DataGenerator`, `ListGenerator`, `ChartGenerator`, `SVGGenerator`.

## Configuration

Set the provider keys you use in NodeTool's secret store (Settings → API Keys)
or as environment variables:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `MISTRAL_API_KEY`
- `XAI_API_KEY`

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

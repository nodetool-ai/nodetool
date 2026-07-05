# @nodetool-ai/transformers-js-provider

Local-models BaseProvider backed by @huggingface/transformers and kokoro-js (chat, TTS, ASR, embeddings) for [NodeTool](https://nodetool.ai).

Runs models locally in-process — no API keys, no network — via ONNX through `@huggingface/transformers`, with kokoro-js for text-to-speech. Registers a `transformers_js` provider on the NodeTool runtime registry, so chat, TTS, ASR, and embedding calls route to local inference like any other provider.

## Install

```bash
npm install @nodetool-ai/transformers-js-provider
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `TransformersJsProvider` | class | Local-models `BaseProvider` (chat, TTS, ASR, embeddings) |
| `registerTransformersJsProvider` | function | Register the provider as `transformers_js` on the runtime registry (idempotent) |
| `discoverLanguageModels` | function | Discover available local chat models |
| `discoverTTSModels` | function | Discover available local text-to-speech models |
| `discoverASRModels` | function | Discover available local speech-recognition models |
| `discoverEmbeddingModels` | function | Discover available local embedding models |

## Usage

```ts
import { registerTransformersJsProvider } from "@nodetool-ai/transformers-js-provider";
import { getRegisteredProvider } from "@nodetool-ai/runtime";

// During server bootstrap
registerTransformersJsProvider();

// Later, resolve the provider class from the registry and use it like any other
const ProviderClass = getRegisteredProvider("transformers_js");
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

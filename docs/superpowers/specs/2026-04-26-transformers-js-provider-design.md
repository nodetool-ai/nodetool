# Transformers.js Provider — Design

**Status:** Draft
**Date:** 2026-04-26
**Owner:** mg
**Scope:** Add a local-models provider backed by `@huggingface/transformers` (and `kokoro-js`) covering chat, TTS, ASR, and embeddings.

## Goal

Expose `@nodetool-ai/transformers-js-nodes` capabilities to the rest of NodeTool through the standard `BaseProvider` interface, so that:

- Chat UI / agent CLI / workflow message nodes can pick a transformers.js model the same way they pick Ollama or OpenAI.
- TTS, ASR, and embedding model pickers (`useTTSProviders`, `useASRProviders`, `useEmbeddingProviders`) automatically surface transformers.js options.
- The provider shares loaded models with the workflow nodes (no double-loading).

## Non-goals

- Tool calls / function calling. Transformers.js text-gen has no native tool API; emulating it via JSON-grammar is out of scope (provider returns `hasToolSupport(_) = false`).
- Vision-language chat (LLaVA, Florence-2 chat). Out of scope; image_to_text remains a workflow-node-only feature.
- Image / video generation. Diffusers.js is not in scope.
- Streaming TTS/ASR. First cut returns full audio / full transcript.
- Tokenization-only utility surface (counting tokens for chat budgets) — providers do not expose this today; not adding it here.

## Package layout

New workspace package `@nodetool-ai/transformers-js-provider` at `packages/transformers-js-provider/`:

```
packages/transformers-js-provider/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                       # exports + side-effect registration
│   ├── transformers-js-provider.ts    # the BaseProvider subclass
│   ├── chat.ts                        # generateMessage / generateMessages impl
│   ├── tts.ts                         # textToSpeechEncoded impl
│   ├── asr.ts                         # automaticSpeechRecognition impl
│   ├── embeddings.ts                  # generateEmbedding impl
│   └── model-discovery.ts             # union(recommendedFor + cache scan)
└── tests/
    ├── chat.test.ts
    ├── tts.test.ts
    ├── asr.test.ts
    ├── embeddings.test.ts
    └── model-discovery.test.ts
```

**Why a new package:** `@nodetool-ai/runtime` is the dependency root for the websocket server and chat CLI. Embedding the wasm/onnx/kokoro stack there pulls those into every server boot. Keeping the provider in its own workspace package preserves the option to lazy-load it (mirrors `@nodetool-ai/transformers-js-nodes` itself).

**Dependencies:**
- `@nodetool-ai/runtime` — `BaseProvider`, types, registry
- `@nodetool-ai/transformers-js-nodes` — `getPipeline`, `loadTransformers`, `recommendedFor`, `scanTransformersJsCache`, `getTransformersJsCacheDir`, `KOKORO_VOICES` (re-export)
- `@nodetool-ai/protocol` — `Chunk`
- `kokoro-js` (transitive via transformers-js-nodes) — already a dep
- No direct `@huggingface/transformers` import; everything routes through `getPipeline`/`loadTransformers` from `transformers-js-nodes`.

## Provider identity

- `provider: ProviderId = "transformers_js"` — matches `tjsRefToUnified()`'s emitted `provider` field, so `getAvailableProviderIds()` and the existing `transformers_js` filter in `useModelManagerStore` pick it up without changes.
- `requiredSecrets() = []` — local inference, no API key.
- `hasToolSupport(_) = false` — explicit, so agent loops do not feed it tool schemas.

## Model discovery

Single helper `discoverTjsModels(taskTypes: string[])` (in `model-discovery.ts`):

1. Read `recommendedFor(t)` for each requested `tjs.<task>`.
2. Read `scanTransformersJsCache(getTransformersJsCacheDir())`.
3. Union by `repo_id`, prefer `downloaded: true` for cached entries.
4. Return as `LanguageModel | TTSModel | ASRModel | EmbeddingModel` shapes (caller picks).

Per-modality task type sets:

| Method                       | Tasks                                                          |
|------------------------------|----------------------------------------------------------------|
| `getAvailableLanguageModels` | `tjs.text_generation`                                          |
| `getAvailableTTSModels`      | `tjs.text_to_speech`                                           |
| `getAvailableASRModels`      | `tjs.automatic_speech_recognition`                             |
| `getAvailableEmbeddingModels`| `tjs.feature_extraction`                                       |

Cached repos that are NOT in any recommended list (the `tjs.cached` bucket from the model manager work) are intentionally NOT exposed via the provider — they cannot be classified into a modality without metadata. The model manager surface still shows them.

`TTSModel.voices` is populated for Kokoro repos (uses the `KOKORO_VOICES` constant from `transformers-js-nodes`); other repos return `voices: undefined`.

## Chat (text-generation)

`generateMessage` — non-streaming:

1. Convert `Message[]` → transformers.js chat format `[{role, content}]`. Drop unsupported roles. Coerce non-string content (text-only).
2. `pipeline = await getPipeline({ task: "text-generation", model, dtype: "auto", device: "auto" })`.
3. Call `pipeline(messages, { max_new_tokens: maxTokens ?? 512, temperature, top_p: topP, do_sample: temperature !== 0 })`.
4. Extract assistant message from the last element of `out[0].generated_text` (transformers.js convention when input is a chat array).
5. Return `Message { role: "assistant", content: <string> }`.

`generateMessages` — streaming:

1. Same setup.
2. Use `TextStreamer` and `InterruptableStoppingCriteria` from `@huggingface/transformers` (both confirmed exported in 3.8.x). Add both to the `TransformersModule` type surface in `transformers-base.ts` and re-export through `loadTransformers()`.
3. Each token emits a `ProviderStreamItem` chunk: `{ type: "chunk", chunk: { content_type: "text", content: <token> } }`.
4. Final yield: `{ type: "message", message: { role: "assistant", content: <full> } }`.
5. `signal: AbortSignal` wired to the streamer's stop hook.

Tools: if `tools` or `toolChoice` provided, log a warning and ignore (don't throw).

Error mapping:
- Pipeline load failure → wrap as `Error("Failed to load <model>: <orig>")`.
- OOM / WASM allocation failure → re-throw with `(hint: try a smaller dtype like q4)`.
- Aborted → throw `DOMException("Aborted", "AbortError")` (matches OpenAI/Anthropic providers).

## TTS

Override `textToSpeechEncoded` (returns full WAV) rather than the streaming `textToSpeech`. Mirrors what the workflow node already does.

1. Detect Kokoro vs. pipeline path (reuse logic from `text-to-speech.ts`).
2. Kokoro: `KokoroTTS.from_pretrained(model, { dtype, device })` (cached), `tts.generate(text, { voice })`.
3. Pipeline: `getPipeline({ task: "text-to-speech", model })(text, opts)`. Pass `speaker_embeddings` only for SpeechT5 repos (mirror existing guard).
4. Encode result Float32 samples as 16-bit PCM WAV (lift the `encodeWav` helper from the node into a shared util in `transformers-js-nodes/src/wav.ts`; both call sites import it).
5. Return `EncodedAudioResult { audio: Uint8Array, mimeType: "audio/wav" }`.

`audioFormat` hint: only `"wav"` is supported in v1; if the caller asks for mp3/opus, log and fall through to wav.

## ASR

Override `automaticSpeechRecognition`:

1. `pipeline = await getPipeline({ task: "automatic-speech-recognition", model })`.
2. transformers.js wants a `Float32Array` at the model's expected sample rate. Decode the input `Uint8Array` (likely WAV) using a small WAV decoder util (write `decodeWav.ts` in `transformers-js-nodes`); resample to 16kHz with linear interpolation if input differs.
3. Call `pipeline(samples, { language, return_timestamps: word_timestamps ? "word" : false })`.
4. Map result → `ASRResult { text, chunks?: [{timestamp, text}] }`.

Whisper-specific options (`task: "transcribe"|"translate"`) — not exposing in v1; default transcribe.

## Embeddings

Override `generateEmbedding`:

1. `pipeline = await getPipeline({ task: "feature-extraction", model })`.
2. Call `pipeline(text, { pooling: "mean", normalize: true })`. Both single-string and array inputs are supported by transformers.js.
3. Coerce result tensor → `number[][]`. For a single input, wrap to `[vec]`.

`dimensions` arg: not honored — transformers.js does not support truncation at inference. Document this and ignore.

## Configuration

Provider takes no constructor args today. Reads:

- `getTransformersJsCacheDir()` for cache scanning (already configurable via `setTransformersJsCacheDir` in the nodes package).
- Env-implicit dtype/device defaults inside `getPipeline` (`auto` everywhere).

Future: per-instance overrides via constructor options (`{ defaultDtype, defaultDevice }`) — not in v1.

## Registration

`packages/transformers-js-provider/src/index.ts` calls `registerProvider("transformers_js", () => new TransformersJsProvider())`. Registration is invoked from the websocket server's provider bootstrap (matches how `@nodetool-ai/runtime`'s built-in providers register today). One-line edit to `packages/websocket/src/server.ts` (or wherever provider modules are imported for side effects).

The `availableProviderIds` query (in `getAvailableProviderIds(userId)`) should include `transformers_js` unconditionally — it has no secrets to gate on. Verify the existing implementation does the right thing for secret-less providers; adjust if needed.

## Frontend integration

No code changes required. Existing hooks (`useTTSProviders`, `useASRProviders`, `useEmbeddingProviders`, `useModelsByProvider`) read `providerCapabilities()` and `getAvailable*Models()`. Once the provider is registered, it shows up automatically.

The model manager's recent work (`getAllModels` scanning the tjs cache) continues to surface cached repos under `tjs.<task>` types — the provider integration is orthogonal and additive.

## Testing

Vitest suites in `packages/transformers-js-provider/tests/`:

- **chat.test.ts** — mocks `getPipeline` to return a fake function that yields canned text. Asserts message conversion, streaming chunk shape, abort behavior, ignored-tools warning.
- **tts.test.ts** — mocks `KokoroTTS.from_pretrained` and `getPipeline`. Asserts Kokoro path uses `voice`, non-Kokoro path uses `speaker_embeddings` only for SpeechT5, output is a valid WAV header.
- **asr.test.ts** — mocks pipeline. Asserts WAV decode, sample-rate resample, result mapping with and without timestamps.
- **embeddings.test.ts** — mocks pipeline. Asserts both string and string[] input paths and that `dimensions` is ignored.
- **model-discovery.test.ts** — mocks `recommendedFor` and `scanTransformersJsCache`. Asserts union, dedup, downloaded flag propagation, voice population for Kokoro entries.

No live model downloads in CI; everything mock-based. A separate `tests/integration/` may run with `RUN_INTEGRATION=1` against actual models for spot checks but is not required.

## Risks

| Risk | Mitigation |
|---|---|
| First chat token latency on unmodelloaded repos (10s+ for 2B fp32) | Surface in UI via existing model-manager download flow; pipeline cache makes 2nd call fast |
| Memory: 2B fp32 ~8GB RAM | Document recommended dtypes (q4 for 4B+, q8 for 2B); future per-call dtype override |
| transformers.js streaming API surface changes | Centralize in `chat.ts`; version-pin `@huggingface/transformers ^3.7` |
| WASM load order / env mutation race (the bug we just fixed for Kokoro) | All entry points await `loadTransformers()` first; provider does the same |

## Out of scope (explicit)

- Tool / function calling
- Vision chat
- Image/video generation
- Streaming TTS/ASR
- Token counting
- Per-call dtype/device overrides

## Migration / backwards compatibility

Net additive. No public API changes in `@nodetool-ai/runtime` or `@nodetool-ai/transformers-js-nodes`. The new package is opt-in until registered; once the websocket server imports it for side effects, the provider becomes available to all clients. No DB migrations.
